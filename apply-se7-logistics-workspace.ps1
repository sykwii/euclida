$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$package = Split-Path -Parent $MyInvocation.MyCommand.Path

$paths = @(
  'frontend\src\app\features\logistics-workspace\logistics-workspace.model.ts',
  'frontend\src\app\features\logistics-workspace\logistics-workspace.service.ts',
  'frontend\src\app\features\logistics-workspace\logistics-workspace-page.ts',
  'frontend\src\app\features\logistics-workspace\logistics-workspace-page.html',
  'frontend\src\app\features\logistics-workspace\logistics-workspace-page.css',
  'docs\stabilization\STOCK_ENGINE_SE7.md'
)

foreach ($relative in $paths) {
  $source = Join-Path $package $relative
  $target = Join-Path $root $relative

  New-Item `
    -ItemType Directory `
    -Force `
    -Path (Split-Path -Parent $target) |
    Out-Null

  Copy-Item $source $target -Force
}

$routesPath = Join-Path $root 'frontend\src\app\app.routes.ts'
$routes = Get-Content $routesPath -Raw

$import = "import { LogisticsWorkspacePage } from './features/logistics-workspace/logistics-workspace-page';"

if (-not $routes.Contains($import)) {
  $routes = $import + [Environment]::NewLine + $routes
}

$routeBlock = @"
  {
    path: 'logistics',
    canActivate: [authGuard],
    component: LogisticsWorkspacePage,
  },
"@

if (-not $routes.Contains("path: 'logistics'")) {
  $anchor = "  {" + [Environment]::NewLine + "    path: 'depots',"
  $routes = $routes.Replace($anchor, $routeBlock + $anchor)
}

Set-Content $routesPath $routes -Encoding UTF8

$appHtmlPath = Join-Path $root 'frontend\src\app\app.component.html'
$appHtml = Get-Content $appHtmlPath -Raw

$navLink = @"
          <a routerLink="/logistics" routerLinkActive="active" title="Огляд логістики">
            <span aria-hidden="true">▦</span>
            <b>Огляд логістики</b>
          </a>
"@

if (-not $appHtml.Contains('routerLink="/logistics"')) {
  $anchor = '          <a routerLink="/depots"'
  $appHtml = $appHtml.Replace($anchor, $navLink + $anchor)
}

Set-Content $appHtmlPath $appHtml -Encoding UTF8

Write-Host 'SE-7 Logistics Workspace applied.'
Write-Host 'Run: cd frontend; npm run build'
