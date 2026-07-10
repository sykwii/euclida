$root = (Get-Location).Path
$backendSrc = Join-Path $root "backend\src"
$outputDir = Join-Path $root "docs\stabilization"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$rows = @()

Get-ChildItem $backendSrc -Recurse -Filter "*.module.ts" | ForEach-Object {
    $moduleFile = $_
    $relativeFile = $moduleFile.FullName.Replace($root + "\", "")
    $content = Get-Content $moduleFile.FullName -Raw

    $moduleNameMatch = [regex]::Match(
        $content,
        "export\s+class\s+([A-Za-z0-9_]+Module)"
    )

    $moduleName = if ($moduleNameMatch.Success) {
        $moduleNameMatch.Groups[1].Value
    } else {
        $moduleFile.BaseName
    }

    $importMatches = [regex]::Matches(
        $content,
        "import\s*\{([^}]+)\}\s*from\s*['""]([^'""]+)['""]"
    )

    foreach ($match in $importMatches) {
        $symbols = $match.Groups[1].Value `
            -split "," `
            | ForEach-Object { $_.Trim() } `
            | Where-Object { $_ }

        $path = $match.Groups[2].Value

        foreach ($symbol in $symbols) {
            if ($symbol -match "Module$") {
                $rows += [PSCustomObject]@{
                    Module       = $moduleName
                    Imports      = $symbol
                    ImportPath   = $path
                    ModuleFile   = $relativeFile
                }
            }
        }
    }
}

$rows = $rows |
    Sort-Object Module, Imports, ImportPath -Unique

$rows |
    Export-Csv `
        (Join-Path $outputDir "MODULE_DEPENDENCIES.csv") `
        -NoTypeInformation `
        -Encoding UTF8

$markdown = @()
$markdown += "# Backend module dependencies"
$markdown += ""
$markdown += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$markdown += ""

$groups = $rows | Group-Object Module | Sort-Object Name

foreach ($group in $groups) {
    $markdown += "## $($group.Name)"
    $markdown += ""

    foreach ($row in $group.Group) {
        $markdown += "- $($row.Imports) — ``$($row.ImportPath)``"
    }

    $markdown += ""
}

$markdown |
    Set-Content `
        (Join-Path $outputDir "MODULE_DEPENDENCIES.md") `
        -Encoding UTF8

Write-Host "Created:"
Write-Host "docs\stabilization\MODULE_DEPENDENCIES.csv"
Write-Host "docs\stabilization\MODULE_DEPENDENCIES.md"
