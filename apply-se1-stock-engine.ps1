$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$package = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $package 'backend\src\stock-engine') (Join-Path $root 'backend\src') -Recurse -Force
Copy-Item (Join-Path $package 'database\init\42_stock_engine_integrity.sql') (Join-Path $root 'database\init') -Force
Copy-Item (Join-Path $package 'docs\stabilization\STOCK_ENGINE_ARCHITECTURE.md') (Join-Path $root 'docs\stabilization') -Force

$movementPath = Join-Path $root 'backend\src\stock-movements\stock-movement.entity.ts'
$content = Get-Content $movementPath -Raw
if ($content -notmatch 'accountingUnit') {
  $insert = @"

  @Column({ name: 'accounting_unit', type: 'varchar', length: 20, nullable: true })
  accountingUnit!: string | null;

  @Column({ name: 'stock_operation_id', type: 'uuid', nullable: true })
  stockOperationId!: string | null;
"@
  $content = $content -replace '\n\}', "$insert`n}"
  Set-Content $movementPath $content -Encoding UTF8
}

$appPath = Join-Path $root 'backend\src\app.module.ts'
$app = Get-Content $appPath -Raw
if ($app -notmatch 'StockEngineModule') {
  $app = $app -replace "import \{ ExecutionModule \} from './execution/execution.module';", "import { ExecutionModule } from './execution/execution.module';`nimport { StockEngineModule } from './stock-engine/stock-engine.module';"
  $app = $app -replace 'ExecutionModule,\s*\n\s*\]', "ExecutionModule,`nStockEngineModule,`n  ]"
  Set-Content $appPath $app -Encoding UTF8
}
Write-Host 'SE-1 files applied. Run DB migration and backend build.'
