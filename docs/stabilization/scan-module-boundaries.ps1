$root = (Get-Location).Path
$output = "docs\stabilization\MODULE_BOUNDARIES.txt"

$lines = @()
$lines += "=== MODULE EXPORTS ==="

Get-ChildItem backend\src -Recurse -Filter *.module.ts | ForEach-Object {
    $relative = $_.FullName.Replace($root + "\", "")
    $content = Get-Content $_.FullName -Raw

    $exportsMatch = [regex]::Match(
        $content,
        "exports\s*:\s*\[([\s\S]*?)\]"
    )

    if ($exportsMatch.Success) {
        $lines += ""
        $lines += "[$relative]"
        $lines += $exportsMatch.Groups[1].Value.Trim()
    }
}

$lines += ""
$lines += "=== CROSS-DOMAIN SERVICE IMPORTS ==="

Get-ChildItem backend\src -Recurse -Filter *.service.ts | ForEach-Object {
    $servicePath = $_.FullName
    $relative = $servicePath.Replace($root + "\", "")
    $content = Get-Content $servicePath -Raw

    $matches = [regex]::Matches(
        $content,
        "import\s*\{\s*([A-Za-z0-9_]+Service)\s*\}\s*from\s*['""]([^'""]+)['""]"
    )

    foreach ($match in $matches) {
        $importPath = $match.Groups[2].Value

        if ($importPath.StartsWith(".") -or $importPath.StartsWith("src/")) {
            $lines += "$relative -> $($match.Groups[1].Value) [$importPath]"
        }
    }
}

$lines |
    Set-Content $output -Encoding UTF8

Write-Host "Created $output"
