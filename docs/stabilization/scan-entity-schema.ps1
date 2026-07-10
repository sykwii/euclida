$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$backendRoot = Join-Path $root "backend\src"
$sqlRoot = Join-Path $root "database\init"
$outputRoot = Join-Path $root "docs\stabilization"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

function Convert-ToSnakeCase {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }

    $result = [regex]::Replace(
        $Value,
        '([A-Z]+)([A-Z][a-z])',
        '$1_$2'
    )

    $result = [regex]::Replace(
        $result,
        '([a-z0-9])([A-Z])',
        '$1_$2'
    )

    return $result.ToLowerInvariant()
}

$entityRows = @()

Get-ChildItem $backendRoot -Recurse -Filter "*.entity.ts" | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw

    $entityMatch = [regex]::Match(
        $content,
        "@Entity\(\s*['""]([^'""]+)['""]\s*\)"
    )

    if (-not $entityMatch.Success) {
        return
    }

    $tableName = $entityMatch.Groups[1].Value

    $classMatch = [regex]::Match(
        $content,
        "export\s+class\s+([A-Za-z0-9_]+)"
    )

    $className = if ($classMatch.Success) {
        $classMatch.Groups[1].Value
    } else {
        $file.BaseName
    }

    $propertyPattern = [regex]::new(
        "(?s)@(PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn|Column)\s*\((.*?)\)\s*(?:!\s*)?([A-Za-z0-9_]+)\s*[!:?]",
        [System.Text.RegularExpressions.RegexOptions]::Multiline
    )

    foreach ($match in $propertyPattern.Matches($content)) {
        $decorator = $match.Groups[1].Value
        $arguments = $match.Groups[2].Value
        $property = $match.Groups[3].Value

        $nameMatch = [regex]::Match(
            $arguments,
            "name\s*:\s*['""]([^'""]+)['""]"
        )

        $columnName = if ($nameMatch.Success) {
            $nameMatch.Groups[1].Value
        } else {
            Convert-ToSnakeCase $property
        }

        $typeMatch = [regex]::Match(
            $arguments,
            "type\s*:\s*['""]([^'""]+)['""]"
        )

        $nullableMatch = [regex]::Match(
            $arguments,
            "nullable\s*:\s*(true|false)"
        )

        $entityRows += [PSCustomObject]@{
            Table      = $tableName
            Entity     = $className
            Property   = $property
            Column     = $columnName
            Decorator  = $decorator
            Type       = if ($typeMatch.Success) {
                $typeMatch.Groups[1].Value
            } elseif ($decorator -eq "PrimaryGeneratedColumn") {
                "uuid"
            } else {
                ""
            }
            Nullable   = if ($nullableMatch.Success) {
                $nullableMatch.Groups[1].Value
            } else {
                ""
            }
            File       = $file.FullName.Replace($root + "\", "")
        }
    }
}

$entityRows |
    Sort-Object Table, Column |
    Export-Csv `
        (Join-Path $outputRoot "ENTITY_COLUMNS.csv") `
        -NoTypeInformation `
        -Encoding UTF8

$sqlFiles = Get-ChildItem $sqlRoot -File -Filter "*.sql" | Sort-Object Name
$sqlContent = ($sqlFiles | ForEach-Object {
    "`n-- FILE: $($_.Name)`n"
    Get-Content $_.FullName -Raw
}) -join "`n"

$sqlRows = @()

$createMatches = [regex]::Matches(
    $sqlContent,
    "(?is)CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_""]+)\s*\((.*?)\)\s*;"
)

foreach ($create in $createMatches) {
    $table = $create.Groups[1].Value.Trim('"')
    $body = $create.Groups[2].Value

    $parts = $body -split ",(?=(?:[^()]*\([^()]*\))*[^()]*$)"

    foreach ($part in $parts) {
        $line = $part.Trim()

        if (
            $line -match "^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b"
        ) {
            continue
        }

        $columnMatch = [regex]::Match(
            $line,
            '^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+([a-zA-Z ]+(?:\([0-9,\s]+\))?)'
        )

        if ($columnMatch.Success) {
            $sqlRows += [PSCustomObject]@{
                Table  = $table
                Column = $columnMatch.Groups[1].Value
                Source = "CREATE TABLE"
            }
        }
    }
}

$alterMatches = [regex]::Matches(
    $sqlContent,
    "(?is)ALTER\s+TABLE\s+([a-zA-Z0-9_""]+)(.*?);"
)

foreach ($alter in $alterMatches) {
    $table = $alter.Groups[1].Value.Trim('"')
    $body = $alter.Groups[2].Value

    $columnMatches = [regex]::Matches(
        $body,
        "(?is)ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?""?([a-zA-Z_][a-zA-Z0-9_]*)""?"
    )

    foreach ($columnMatch in $columnMatches) {
        $sqlRows += [PSCustomObject]@{
            Table  = $table
            Column = $columnMatch.Groups[1].Value
            Source = "ALTER TABLE"
        }
    }
}

$sqlRows = $sqlRows | Sort-Object Table, Column -Unique

$sqlRows |
    Export-Csv `
        (Join-Path $outputRoot "SQL_COLUMNS.csv") `
        -NoTypeInformation `
        -Encoding UTF8

$sqlLookup = @{}

foreach ($row in $sqlRows) {
    $key = "$($row.Table).$($row.Column)"
    $sqlLookup[$key] = $true
}

$entityLookup = @{}

foreach ($row in $entityRows) {
    $key = "$($row.Table).$($row.Column)"
    $entityLookup[$key] = $true
}

$missingInSql = $entityRows |
    Where-Object {
        -not $sqlLookup.ContainsKey("$($_.Table).$($_.Column)")
    } |
    Sort-Object Table, Column

$missingInEntity = $sqlRows |
    Where-Object {
        -not $entityLookup.ContainsKey("$($_.Table).$($_.Column)")
    } |
    Sort-Object Table, Column

$report = @()
$report += "# Entity and SQL schema comparison"
$report += ""
$report += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += ""
$report += "Entities: $(($entityRows | Select-Object Entity -Unique).Count)"
$report += "Entity columns: $($entityRows.Count)"
$report += "SQL columns detected: $($sqlRows.Count)"
$report += ""

$report += "## Entity columns not detected in SQL"
$report += ""

if ($missingInSql.Count -eq 0) {
    $report += "- None detected"
} else {
    foreach ($row in $missingInSql) {
        $report += "- ``$($row.Table).$($row.Column)`` — $($row.File)"
    }
}

$report += ""
$report += "## SQL columns without detected Entity columns"
$report += ""
$report += "These are not automatically defects. Some tables or columns may be used only by raw SQL."
$report += ""

if ($missingInEntity.Count -eq 0) {
    $report += "- None detected"
} else {
    foreach ($row in $missingInEntity) {
        $report += "- ``$($row.Table).$($row.Column)``"
    }
}

$report |
    Set-Content `
        (Join-Path $outputRoot "ENTITY_SQL_COMPARISON.md") `
        -Encoding UTF8

Write-Host "Created:"
Write-Host "docs\stabilization\ENTITY_COLUMNS.csv"
Write-Host "docs\stabilization\SQL_COLUMNS.csv"
Write-Host "docs\stabilization\ENTITY_SQL_COMPARISON.md"

