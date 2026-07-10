$root = (Get-Location).Path
$out = "docs\stabilization\REALTIME_DETAILS.txt"

$patterns = @(
  "RealtimeGateway",
  "realtimeEvents\.emit",
  "realtimeEvents\.emitMany",
  "realtime\.emit",
  "notifyRealtime",
  "onAnyChanged",
  "onServiceOrdersChanged",
  "onFireMissionsChanged",
  "onMapChanged",
  "onStockChanged",
  "onEventCreated",
  "onAnalyticsChanged",
  "onReferenceChanged",
  "onUsersChanged",
  "onSettingsChanged",
  "onAllChanged",
  "autoRefresh\.watch",
  "autoRefresh\.watchAll",
  "\.watchMany\(",
  "\.watch\("
)

Get-ChildItem backend\src,frontend\src -Recurse -Filter *.ts |
  Select-String -Pattern $patterns -Context 3,8 |
  ForEach-Object {
    "`n=== $($_.Path.Replace($root + '\','')):$($_.LineNumber) ==="
    $_.Context.PreContext
    $_.Line
    $_.Context.PostContext
  } |
  Set-Content $out -Encoding UTF8

Write-Host "Created $out"
