$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$package = Split-Path -Parent $MyInvocation.MyCommand.Path

$paths = @(
  'database\init\43_drone_stock_engine.sql',
  'backend\src\stock-engine\drone-stock-engine.types.ts',
  'backend\src\stock-engine\drone-stock-engine.service.ts',
  'backend\src\stock-engine\adapters\drone-location-stock.adapter.ts',
  'backend\src\stock-engine\stock-operation.entity.ts',
  'backend\src\stock-engine\stock-engine.module.ts',
  'backend\src\drone-logistics\drone-stock-movement.entity.ts',
  'backend\src\drone-logistics\drone-logistics.module.ts',
  'docs\stabilization\STOCK_ENGINE_SE3.md'
)

foreach ($relative in $paths) {
  $source = Join-Path $package $relative
  $target = Join-Path $root $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) |
    Out-Null
  Copy-Item $source $target -Force
}

Write-Host 'Base SE-3 files copied.'
Write-Host 'Now replace DroneLogisticsService mutation methods using the patch instructions.'
