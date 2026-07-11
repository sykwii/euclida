$ErrorActionPreference = 'Stop'

$projectRoot = (Get-Location).Path
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $projectRoot 'backend\src\app.module.ts'))) {
  throw 'Run this script from the Euclida project root.'
}

$sourceBackend = Join-Path $packageRoot 'backend\src\execution'
$targetBackend = Join-Path $projectRoot 'backend\src\execution'
$sourceMigration = Join-Path $packageRoot 'database\init\41_execution_journal.sql'
$targetMigration = Join-Path $projectRoot 'database\init\41_execution_journal.sql'
$sourceDoc = Join-Path $packageRoot 'docs\stabilization\EXECUTION_JOURNAL_EA2.md'
$targetDoc = Join-Path $projectRoot 'docs\stabilization\EXECUTION_JOURNAL_EA2.md'

New-Item -ItemType Directory -Force -Path $targetBackend | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $targetMigration -Parent) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $targetDoc -Parent) | Out-Null

Copy-Item (Join-Path $sourceBackend '*') $targetBackend -Recurse -Force
Copy-Item $sourceMigration $targetMigration -Force
Copy-Item $sourceDoc $targetDoc -Force

$appModulePath = Join-Path $projectRoot 'backend\src\app.module.ts'
$appModule = Get-Content $appModulePath -Raw -Encoding UTF8

if ($appModule -notmatch "from './execution/execution.module'") {
  $anchor = "import { ShotConfigurationsModule } from './shot-configurations/shot-configurations.module';"
  if (-not $appModule.Contains($anchor)) {
    throw 'ShotConfigurationsModule import anchor not found in app.module.ts.'
  }
  $appModule = $appModule.Replace(
    $anchor,
    $anchor + "`r`nimport { ExecutionModule } from './execution/execution.module';"
  )
}

if ($appModule -notmatch '(?m)^\s*ExecutionModule,\s*$') {
  $anchor = 'ShotConfigurationsModule,'
  if (-not $appModule.Contains($anchor)) {
    throw 'ShotConfigurationsModule imports anchor not found in app.module.ts.'
  }
  $appModule = $appModule.Replace($anchor, $anchor + "`r`n    ExecutionModule,")
}

Set-Content $appModulePath -Value $appModule -Encoding UTF8

Write-Host 'EA-2 execution journal files installed.'
Write-Host 'Next:'
Write-Host '  1) Apply database/init/41_execution_journal.sql to the existing DB.'
Write-Host '  2) cd backend; npm run build'
