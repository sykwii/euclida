[CmdletBinding()]
param(
    [string]$Container = 'euclida-postgres',
    [string]$User = 'euclida_user',
    [string]$LiveDatabase = 'euclida_situation_db',
    [string]$InitDirectory = '',
    [switch]$KeepTemporaryDatabase
)

$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($InitDirectory)) {
    $InitDirectory = Join-Path $scriptDirectory '..\database\init'
}
$temporaryPrefix = 'euclida_release_verify_'
$temporaryDatabase = $temporaryPrefix + (Get-Date -Format 'yyyyMMddHHmmss')

function Assert-SafeDatabaseName {
    param([Parameter(Mandatory)][string]$Database)

    if ($Database -notmatch '^[a-zA-Z0-9_]+$') {
        throw "Unsafe database name: $Database"
    }
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory)][string]$Database,
        [Parameter(Mandatory)][string]$Sql,
        [Parameter(Mandatory)][string]$Context
    )

    Assert-SafeDatabaseName $Database
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = $Sql | & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 -U $User -d $Database -f - 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "$Context failed against $Database.`n$($output -join "`n")"
    }
    return $output
}

function Invoke-Migration {
    param(
        [Parameter(Mandatory)][string]$Database,
        [Parameter(Mandatory)][System.IO.FileInfo]$File
    )

    $sql = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8
    try {
        $null = Invoke-Psql -Database $Database -Sql $sql -Context "Migration $($File.Name)"
        Write-Host "APPLIED [$Database] $($File.Name)"
    } catch {
        throw "FAILED SCRIPT: $($File.FullName)`n$($_.Exception.Message)"
    }
}

function Get-SchemaManifest {
    param([Parameter(Mandatory)][string]$Database)

    $sql = @'
SELECT 'TABLE|' || table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'COLUMN|' || table_name || '|' || column_name || '|' || data_type || '|' || is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
UNION ALL
SELECT 'INDEX|' || tablename || '|' || indexname
FROM pg_indexes
WHERE schemaname = 'public'
UNION ALL
SELECT 'CONSTRAINT|' || tc.table_name || '|' || tc.constraint_name || '|' || tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.constraint_name !~ '^[0-9]+_[0-9]+_[0-9]+_not_null$'
ORDER BY 1;
'@

    $output = Invoke-Psql -Database $Database -Sql $sql -Context 'Schema manifest'
    return @(
        $output |
            ForEach-Object { "$_".Trim() } |
            Where-Object { $_ -match '^(TABLE|COLUMN|INDEX|CONSTRAINT)\|' }
    )
}

function Assert-CriticalSchema {
    param([Parameter(Mandatory)][string]$Database)

    $sql = @'
WITH required(table_name, column_name) AS (
    VALUES
      ('weapon_systems', 'current_fire_position_id'),
      ('weapon_systems', 'weapon_model_id'),
      ('weapon_systems', 'readiness_status'),
      ('weapon_systems', 'is_archived'),
      ('fire_positions', 'ammo_depot_id'),
      ('fire_positions', 'main_direction_units'),
      ('fire_positions', 'main_direction_degrees'),
      ('fire_positions', 'traverse_left_units'),
      ('fire_positions', 'traverse_left_degrees'),
      ('fire_positions', 'traverse_right_units'),
      ('fire_positions', 'traverse_right_degrees'),
      ('fire_positions', 'sector_left_degrees'),
      ('fire_positions', 'sector_right_degrees'),
      ('fire_positions', 'readiness_status'),
      ('fire_positions', 'not_ready_reason'),
      ('shot_configurations', 'weapon_model_id'),
      ('shot_configurations', 'max_range_m'),
      ('execution_records', 'status'),
      ('execution_records', 'idempotency_key'),
      ('execution_records', 'stock_operation_id'),
      ('stock_operations', 'idempotency_key'),
      ('stock_operations', 'movement_group_id'),
      ('weapon_maintenances', 'status'),
      ('operational_notifications', 'source_event_key'),
      ('operational_notifications', 'read_at'),
      ('service_order_deliveries', 'service_order_id'),
      ('service_order_deliveries', 'recipient_unit_id'),
      ('service_order_deliveries', 'status')
)
SELECT table_name || '.' || column_name
FROM required r
WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = r.table_name
      AND c.column_name = r.column_name
)
ORDER BY 1;
'@

    $output = Invoke-Psql -Database $Database -Sql $sql -Context 'Critical schema check'
    $missing = @(
        $output |
            ForEach-Object { "$_".Trim() } |
            Where-Object { $_ -match '^[a-z0-9_]+\.[a-z0-9_]+$' }
    )
    if ($missing.Count -gt 0) {
        throw "Critical Core schema is incomplete in ${Database}:`n$($missing -join "`n")"
    }
    Write-Host "CRITICAL SCHEMA [$Database] PASS (28 required columns)"
}

function Assert-WeaponSystemCanonicalInsertShape {
    param([Parameter(Mandatory)][string]$Database)

    $sql = @'
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'weapon_systems'
  AND column_name IN ('system_type', 'model')
  AND is_nullable = 'NO'
  AND column_default IS NULL
ORDER BY column_name;
'@

    $output = Invoke-Psql -Database $Database -Sql $sql -Context 'WeaponSystem canonical insert shape check'
    $blockingColumns = @(
        $output |
            ForEach-Object { "$_".Trim() } |
            Where-Object { $_ -in @('system_type', 'model') }
    )
    if ($blockingColumns.Count -gt 0) {
        throw "Legacy WeaponSystem columns block canonical inserts in ${Database}: $($blockingColumns -join ', ')"
    }
    Write-Host "WEAPON INSERT SHAPE [$Database] PASS"
}

Assert-SafeDatabaseName $LiveDatabase
Assert-SafeDatabaseName $temporaryDatabase

$scripts = @(Get-ChildItem -LiteralPath $InitDirectory -File -Filter '*.sql' | Sort-Object Name)
if ($scripts.Count -eq 0) {
    throw "No SQL scripts found in $InitDirectory"
}

$bootstrap = $scripts | Where-Object Name -eq '01_init_databases.sql'
$applicationScripts = @($scripts | Where-Object Name -ne '01_init_databases.sql')
if ($bootstrap.Count -ne 1) {
    throw 'Expected exactly one 01_init_databases.sql bootstrap script.'
}

try {
    Write-Host "Verifying bootstrap rerun against postgres..."
    Invoke-Migration -Database 'postgres' -File $bootstrap[0]

    Write-Host "Verifying rerun against live database $LiveDatabase..."
    foreach ($script in $applicationScripts) {
        Invoke-Migration -Database $LiveDatabase -File $script
    }

    $null = Invoke-Psql -Database 'postgres' -Context "Create temporary database $temporaryDatabase" -Sql "CREATE DATABASE `"$temporaryDatabase`";"
    Write-Host "Created temporary database $temporaryDatabase."

    Write-Host 'Applying all application migrations to the clean temporary database...'
    foreach ($script in $applicationScripts) {
        Invoke-Migration -Database $temporaryDatabase -File $script
    }

    Write-Host 'Verifying that the clean database is rerunnable...'
    foreach ($script in $applicationScripts) {
        Invoke-Migration -Database $temporaryDatabase -File $script
    }

    Assert-CriticalSchema -Database $LiveDatabase
    Assert-CriticalSchema -Database $temporaryDatabase
    Assert-WeaponSystemCanonicalInsertShape -Database $LiveDatabase
    Assert-WeaponSystemCanonicalInsertShape -Database $temporaryDatabase

    $liveManifest = @(Get-SchemaManifest -Database $LiveDatabase)
    $temporaryManifest = @(Get-SchemaManifest -Database $temporaryDatabase)
    $comparison = @(Compare-Object -ReferenceObject $liveManifest -DifferenceObject $temporaryManifest)
    $missingFromLive = @($comparison | Where-Object SideIndicator -eq '=>')
    $liveOnly = @($comparison | Where-Object SideIndicator -eq '<=')

    Write-Host "SCHEMA SUMMARY live=$($liveManifest.Count) temporary=$($temporaryManifest.Count) missing_from_live=$($missingFromLive.Count) live_only=$($liveOnly.Count)"
    if ($comparison.Count -gt 0) {
        Write-Warning "Historical schema drift detected; critical Core objects are present in both databases."
    }

    Write-Host "PASS: $($scripts.Count) init scripts are strict, clean-applicable, and rerunnable."
} finally {
    if (-not $KeepTemporaryDatabase) {
        if ($temporaryDatabase -notlike "$temporaryPrefix*") {
            throw "Refusing to drop non-verifier database $temporaryDatabase"
        }

        $existsSql = "SELECT 1 FROM pg_database WHERE datname = '$temporaryDatabase';"
        $exists = $existsSql | & docker exec -i $Container psql -X -A -t -v ON_ERROR_STOP=1 -U $User -d postgres -f - 2>$null
        if ($LASTEXITCODE -eq 0 -and ($exists -join '').Trim() -eq '1') {
            $null = Invoke-Psql -Database 'postgres' -Context "Drop temporary database $temporaryDatabase" -Sql "DROP DATABASE `"$temporaryDatabase`" WITH (FORCE);"
            Write-Host "Dropped temporary database $temporaryDatabase."
        }
    } else {
        Write-Host "Kept temporary database $temporaryDatabase."
    }
}
