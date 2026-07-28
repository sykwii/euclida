[CmdletBinding()]
param(
    [int]$BackendPort = 3000,
    [int]$FrontendPort = 8844,
    [int]$TimeoutSeconds = 90,
    [switch]$StopStaleEuclida
)

$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory '..'))
$runtimeDirectory = Join-Path $repositoryRoot '.release'
$logDirectory = Join-Path $runtimeDirectory 'logs'

function Get-PortOwner {
    param([Parameter(Mandatory)][int]$Port)

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) {
        return $null
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    return [pscustomobject]@{
        Port = $Port
        ProcessId = [int]$listener.OwningProcess
        Name = $process.Name
        CommandLine = $process.CommandLine
    }
}

function Test-EuclidaPortOwner {
    param([Parameter(Mandatory)]$Owner)

    $normalizedCommand = "$($Owner.CommandLine)".ToLowerInvariant()
    $normalizedRoot = $repositoryRoot.ToLowerInvariant()
    $repositoryCommand = $normalizedCommand.Contains($normalizedRoot)
    $releaseBackendCommand =
        $Owner.Port -eq $BackendPort -and
        $Owner.Name -eq 'node.exe' -and
        $normalizedCommand -match '^\s*"?node"?\s+dist[\\/]src[\\/]main\.js\s*$'

    return $releaseBackendCommand -or (
        $repositoryCommand -and
        ($Owner.Name -match '^(node|npm|ng)(\.exe|\.cmd)?$' -or
         $normalizedCommand -match '(nest|ng serve|dist[\\/]src[\\/]main\.js)')
    )
}

function Clear-StalePort {
    param([Parameter(Mandatory)][int]$Port)

    $owner = Get-PortOwner -Port $Port
    if (-not $owner) {
        return
    }

    Write-Host "PORT $Port OCCUPIED pid=$($owner.ProcessId) process=$($owner.Name)"
    Write-Host "COMMAND $($owner.CommandLine)"

    if (-not $StopStaleEuclida) {
        throw "Port $Port is occupied. Re-run with -StopStaleEuclida only if this is a stale Euclida process."
    }
    if (-not (Test-EuclidaPortOwner -Owner $owner)) {
        throw "Refusing to stop pid $($owner.ProcessId): it is not a confirmed process from $repositoryRoot."
    }

    Stop-Process -Id $owner.ProcessId -Force
    Start-Sleep -Milliseconds 500
    if (Get-PortOwner -Port $Port) {
        throw "Failed to release port $Port after stopping pid $($owner.ProcessId)."
    }
    Write-Host "STOPPED stale Euclida pid=$($owner.ProcessId) port=$Port"
}

function Wait-HttpEndpoint {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][int[]]$AcceptedStatus,
        [Parameter(Mandatory)][System.Diagnostics.Process]$Process
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = 'no response'
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            throw "$Name process pid=$($Process.Id) exited with code $($Process.ExitCode) before $Uri became ready."
        }
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
            if ($AcceptedStatus -contains [int]$response.StatusCode) {
                Write-Host "READY $Name $Uri status=$([int]$response.StatusCode)"
                return
            }
            $lastError = "HTTP $([int]$response.StatusCode)"
        } catch {
            if ($_.Exception.Response -and $AcceptedStatus -contains [int]$_.Exception.Response.StatusCode) {
                Write-Host "READY $Name $Uri status=$([int]$_.Exception.Response.StatusCode)"
                return
            }
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Seconds 1
    }

    throw "$Name did not become ready at $Uri within $TimeoutSeconds seconds. Last error: $lastError"
}

function Assert-RepositoryPortOwner {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$Port
    )

    $owner = Get-PortOwner -Port $Port
    if (-not $owner) {
        throw "$Name reported ready but no process owns port $Port."
    }
    if (-not (Test-EuclidaPortOwner -Owner $owner)) {
        throw "$Name port $Port is owned by unrelated pid=$($owner.ProcessId): $($owner.CommandLine)"
    }
    return $owner
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Clear-StalePort -Port $BackendPort
Clear-StalePort -Port $FrontendPort

$postgresStatus = & docker inspect -f '{{.State.Running}}' euclida-postgres 2>$null
if ($LASTEXITCODE -ne 0) {
    & docker compose -f (Join-Path $repositoryRoot 'docker-compose.yml') up -d euclida-postgres
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to create/start euclida-postgres with Docker Compose.'
    }
} elseif (($postgresStatus -join '').Trim() -ne 'true') {
    & docker start euclida-postgres | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to start existing euclida-postgres container.'
    }
}
Write-Host 'READY PostgreSQL container=euclida-postgres'

$backend = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', 'start:prod' `
    -WorkingDirectory (Join-Path $repositoryRoot 'backend') `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'backend.out.log') `
    -RedirectStandardError (Join-Path $logDirectory 'backend.err.log') `
    -PassThru

$frontend = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', 'start:stable' `
    -WorkingDirectory (Join-Path $repositoryRoot 'frontend') `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'frontend.out.log') `
    -RedirectStandardError (Join-Path $logDirectory 'frontend.err.log') `
    -PassThru

try {
    Wait-HttpEndpoint -Name 'backend' -Uri "http://127.0.0.1:$BackendPort/auth/login" -AcceptedStatus @(404) -Process $backend
    Wait-HttpEndpoint -Name 'frontend' -Uri "http://127.0.0.1:$FrontendPort/" -AcceptedStatus @(200) -Process $frontend
    $backendOwner = Assert-RepositoryPortOwner -Name 'backend' -Port $BackendPort
    $frontendOwner = Assert-RepositoryPortOwner -Name 'frontend' -Port $FrontendPort
} catch {
    Write-Host "BACKEND LOG: $(Join-Path $logDirectory 'backend.err.log')"
    Write-Host "FRONTEND LOG: $(Join-Path $logDirectory 'frontend.err.log')"
    throw
}

$processState = [ordered]@{
    startedAt = (Get-Date).ToString('o')
    repository = $repositoryRoot
    backend = [ordered]@{ pid = $backendOwner.ProcessId; launcherPid = $backend.Id; port = $BackendPort }
    frontend = [ordered]@{ pid = $frontendOwner.ProcessId; launcherPid = $frontend.Id; port = $FrontendPort }
}
$processState | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'processes.json') -Encoding UTF8

Write-Host "STARTED backend pid=$($backendOwner.ProcessId) launcherPid=$($backend.Id) port=$BackendPort"
Write-Host "STARTED frontend pid=$($frontendOwner.ProcessId) launcherPid=$($frontend.Id) port=$FrontendPort"
Write-Host "PROCESS STATE $(Join-Path $runtimeDirectory 'processes.json')"
