$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$package = Split-Path -Parent $MyInvocation.MyCommand.Path

$copyMap = @(
  @{
    Source = 'backend\src\stock-engine\stock-operation.types.ts'
    Target = 'backend\src\stock-engine\stock-operation.types.ts'
  },
  @{
    Source = 'backend\src\stock-engine\stock-engine.service.ts'
    Target = 'backend\src\stock-engine\stock-engine.service.ts'
  },
  @{
    Source = 'backend\src\stock-movements\stock-movements.service.ts'
    Target = 'backend\src\stock-movements\stock-movements.service.ts'
  },
  @{
    Source = 'backend\src\stock-movements\stock-movements.module.ts'
    Target = 'backend\src\stock-movements\stock-movements.module.ts'
  },
  @{
    Source = 'docs\stabilization\STOCK_ENGINE_SE2.md'
    Target = 'docs\stabilization\STOCK_ENGINE_SE2.md'
  }
)

foreach ($item in $copyMap) {
  $source = Join-Path $package $item.Source
  $target = Join-Path $root $item.Target
  $targetDirectory = Split-Path -Parent $target

  New-Item -ItemType Directory -Force -Path $targetDirectory |
    Out-Null

  Copy-Item $source $target -Force
}

Write-Host 'SE-2 applied.'
Write-Host 'Run: cd backend; npm run build'
