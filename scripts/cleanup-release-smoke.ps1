[CmdletBinding()]
param(
    [string]$Container = 'euclida-postgres',
    [string]$User = 'euclida_user',
    [string]$Database = 'euclida_situation_db'
)

$ErrorActionPreference = 'Stop'
if ($Database -notmatch '^[a-zA-Z0-9_]+$') {
    throw "Unsafe database name: $Database"
}

$sql = @'
BEGIN;

WITH changed AS (
  UPDATE service_orders
  SET status = 'cancelled',
      updated_at = now(),
      result_comment = concat_ws(E'\n', nullif(result_comment, ''), 'RELEASE-STAB-1 cleanup')
  WHERE order_number LIKE 'RELEASE-SMOKE-%'
    AND status IN (
      'draft',
      'proposed',
      'sent',
      'sent_to_division',
      'sent_to_battery',
      'accepted',
      'in_progress',
      'rejected'
    )
  RETURNING id
)
SELECT 'cancelled_active_orders' AS action, count(*) AS affected FROM changed;

WITH changed AS (
  UPDATE users
  SET is_active = false,
      updated_at = now()
  WHERE login LIKE 'RELEASE-SMOKE-%'
     OR full_name LIKE 'RELEASE-SMOKE%'
  RETURNING id
)
SELECT 'deactivated_users' AS action, count(*) AS affected FROM changed;

WITH changed AS (
  UPDATE shot_configurations
  SET is_active = false,
      updated_at = now()
  WHERE name LIKE 'RELEASE-SMOKE-%'
  RETURNING id
)
SELECT 'deactivated_shot_kits' AS action, count(*) AS affected FROM changed;

WITH changed AS (
  UPDATE weapon_systems
  SET is_archived = true,
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  WHERE callsign LIKE 'RELEASE-SMOKE-%'
     OR serial_number LIKE 'RELEASE-SMOKE-%'
  RETURNING id
)
SELECT 'archived_weapons' AS action, count(*) AS affected FROM changed;

WITH changed AS (
  UPDATE depots
  SET is_archived = true,
      updated_at = now()
  WHERE name LIKE 'RELEASE-SMOKE-%'
  RETURNING id
)
SELECT 'archived_depots' AS action, count(*) AS affected FROM changed;

SELECT
  'preserved_historical_orders' AS action,
  count(*) AS affected
FROM service_orders
WHERE order_number LIKE 'RELEASE-SMOKE-%'
  AND status IN ('completed', 'cancelled');

COMMIT;
'@

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $output = $sql |
        & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 -U $User -d $Database -f - 2>&1
    $exitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}

if ($exitCode -ne 0) {
    throw "RELEASE-SMOKE cleanup failed.`n$($output -join "`n")"
}

$output
Write-Host 'PASS: RELEASE-SMOKE data was cancelled/archived/deactivated without deleting history.'
