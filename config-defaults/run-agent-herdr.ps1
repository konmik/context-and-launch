Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
trap {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 64
}

if ($args.Length -lt 5) {
    throw 'Usage: run-agent-herdr.ps1 <prompt> <agent display name> <workspace label> <pane label> <agent command...>'
}
if (-not (Get-Command herdr -ErrorAction SilentlyContinue)) {
    throw 'Herdr is not installed or is not available on PATH.'
}

$initialPrompt = [string]$args[0]
$agentDisplayName = [string]$args[1]
$workspaceLabel = [string]$args[2]
$ticketPaneLabel = [string]$args[3]
$agentCommand = @($args[4..($args.Length - 1)] | ForEach-Object { [string]$_ })
$launchDir = (Get-Location).Path

function Get-Field {
    param($Object, [string]$Name)
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) {
        return $Object.PSObject.Properties[$Name].Value
    }
    return $null
}

function ConvertTo-PowerShellLiteral {
    param([string]$Value)
    return "'$($Value.Replace("'", "''"))'"
}

# A native command writing to stderr raises a terminating NativeCommandError while
# $ErrorActionPreference is 'Stop', which aborts before $LASTEXITCODE is read and
# leaves the trap with nothing but Herdr's raw stderr line. Exit codes decide the
# failure path here, so every Herdr failure keeps the command that produced it.
function Invoke-HerdrRaw {
    param([string[]]$CommandArgs)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & herdr @CommandArgs 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Text = (@($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
    }
}

# Herdr reports a failure it understands as a JSON envelope. Anything else came
# from the CLI itself, before it reached the server.
function Get-HerdrReportedError {
    param([string]$Text)
    try { $parsed = $Text | ConvertFrom-Json } catch { return $null }
    $reported = Get-Field $parsed 'error'
    if ($null -eq $reported) { return $null }
    $message = [string](Get-Field $reported 'message')
    if ([string]::IsNullOrWhiteSpace($message)) { return $null }
    return $message
}

function Test-HerdrServerRunning {
    $status = Invoke-HerdrRaw @('status')
    if ($status.ExitCode -ne 0) { return $false }
    return $status.Text -match '(?m)^\s*status:\s*running\s*$'
}

function Invoke-Herdr {
    param([string[]]$CommandArgs)
    $command = "herdr $($CommandArgs -join ' ')"
    $result = Invoke-HerdrRaw $CommandArgs
    if ($result.ExitCode -ne 0) {
        $reported = Get-HerdrReportedError $result.Text
        if ($reported) { throw "$command failed: $reported" }
        if (-not (Test-HerdrServerRunning)) {
            throw "Herdr is not running. Start Herdr, then launch the agent again." +
                " ($command exited $($result.ExitCode): $($result.Text))"
        }
        throw "$command failed (exit $($result.ExitCode)): $($result.Text)"
    }
    try {
        return $result.Text | ConvertFrom-Json
    } catch {
        throw "$command returned output that is not JSON: $($result.Text)"
    }
}

function Get-PaneProcesses {
    param([string]$PaneId)
    return (Invoke-Herdr @('pane', 'process-info', '--pane', $PaneId)).result.process_info
}

function Get-ForegroundChildren {
    param($ProcessInfo)
    $shellPid = [int]$ProcessInfo.shell_pid
    return @($ProcessInfo.foreground_processes | Where-Object {
        [int](Get-Field $_ 'pid') -ne $shellPid
    })
}

function Stop-AgentChild {
    param([string]$PaneId)
    Invoke-Herdr @('pane', 'run', $PaneId, '/quit') | Out-Null
    Start-Sleep -Milliseconds 250
    if (@(Get-ForegroundChildren (Get-PaneProcesses $PaneId)).Count -eq 0) {
        return
    }
    Invoke-Herdr @('pane', 'send-keys', $PaneId, 'enter') | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        if (@(Get-ForegroundChildren (Get-PaneProcesses $PaneId)).Count -eq 0) {
            return
        }
    }
    throw "Agent in pane '$PaneId' did not stop."
}

function Get-AgentsInPane {
    param([string]$PaneId)
    $agentList = Invoke-Herdr @('agent', 'list')
    return @($agentList.result.agents | Where-Object {
        [string](Get-Field $_ 'pane_id') -eq $PaneId
    })
}

function Wait-AgentReleased {
    param([string]$PaneId)
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (@(Get-AgentsInPane $PaneId).Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Herdr did not release the agent in pane '$PaneId'."
}

function Start-Agent {
    param([string]$PaneId)

    # Herdr's Windows agent launcher passes a bare executable name to
    # Start-Process, which can select an extensionless npm shim instead of its
    # runnable .cmd/.exe sibling. Let the pane shell resolve the configured
    # command and preserve every argument in an encoded PowerShell invocation.
    $launchScript = '& ' + (@(
        $agentCommand | ForEach-Object { ConvertTo-PowerShellLiteral $_ }
    ) -join ' ')
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launchScript))
    $launchCommand = "powershell.exe -NoLogo -NoProfile -EncodedCommand $encoded"
    Invoke-Herdr @('pane', 'run', $PaneId, $launchCommand) | Out-Null

    $detected = $null
    for ($attempt = 0; $attempt -lt 360; $attempt++) {
        $agents = @(Get-AgentsInPane $PaneId)
        if ($agents.Count -eq 1) {
            $status = [string](Get-Field $agents[0] 'agent_status')
            if ($status -ceq 'idle' -or $status -ceq 'done') {
                $detected = $agents[0]
                break
            }
        }
        Start-Sleep -Milliseconds 250
    }
    if ($null -eq $detected) {
        throw "Herdr did not detect a ready '$($agentCommand[0])' agent in pane '$PaneId'."
    }

    Invoke-Herdr @('agent', 'rename', $PaneId, $agentDisplayName) | Out-Null
    Invoke-Herdr @('pane', 'rename', $PaneId, $ticketPaneLabel) | Out-Null
    if ([string]::IsNullOrWhiteSpace($initialPrompt)) { return $detected }
    Start-Sleep -Milliseconds 1500
    return Invoke-Herdr @('agent', 'prompt', $PaneId, $initialPrompt)
}

$workspaceList = Invoke-Herdr @('workspace', 'list')
$workspaces = @($workspaceList.result.workspaces | Where-Object {
    (Get-Field $_ 'label') -ceq $workspaceLabel
})

$ticketPaneId = ''
$workspacePanes = @()
if ($workspaces.Count -gt 0) {
    $workspaceId = [string]$workspaces[0].workspace_id
    $paneList = Invoke-Herdr @('pane', 'list', '--workspace', $workspaceId)
    $workspacePanes = @($paneList.result.panes)
} else {
    $created = Invoke-Herdr @(
        'workspace', 'create', '--cwd', $launchDir,
        '--label', $workspaceLabel, '--no-focus'
    )
    $workspaceId = [string]$created.result.workspace.workspace_id
    $ticketPaneId = [string]$created.result.root_pane.pane_id
}

$ticketPanes = @($workspacePanes | Where-Object {
    (Get-Field $_ 'label') -ceq $ticketPaneLabel
})
if ($ticketPanes.Count -gt 1) {
    throw "Ticket pane '$ticketPaneLabel' is not unique."
}

if ($ticketPanes.Count -eq 1) {
    $paneId = [string](Get-Field $ticketPanes[0] 'pane_id')
    $processes = Get-PaneProcesses $paneId
    $children = @(Get-ForegroundChildren $processes)
    if ($children.Count -gt 0) {
        $agents = @(Get-AgentsInPane $paneId)
        $status = if ($agents.Count -eq 1) {
            [string](Get-Field $agents[0] 'agent_status')
        } else {
            'unknown'
        }
        if ($status -cne 'idle' -and $status -cne 'done') {
            throw "Ticket pane '$ticketPaneLabel' already has a Herdr agent ($status)."
        }
        Stop-AgentChild $paneId
        Wait-AgentReleased $paneId
    }
    Start-Agent $paneId | ConvertTo-Json -Depth 10 | Write-Output
    exit 0
}

if (-not $ticketPaneId) {
    $availablePanes = @($workspacePanes | Where-Object {
        [string]::IsNullOrWhiteSpace([string](Get-Field $_ 'label')) -and
            [string](Get-Field $_ 'cwd') -ieq $launchDir
    })
    if ($availablePanes.Count -gt 0) {
        $candidateId = [string](Get-Field $availablePanes[0] 'pane_id')
        $processes = Get-PaneProcesses $candidateId
        if (@(Get-ForegroundChildren $processes).Count -eq 0) {
            $ticketPaneId = $candidateId
        }
    }
}
if (-not $ticketPaneId) {
    if ($workspacePanes.Count -eq 0) {
        throw "Herdr workspace '$workspaceId' has no pane to split."
    }
    $split = Invoke-Herdr @(
        'pane', 'split', [string](Get-Field $workspacePanes[0] 'pane_id'),
        '--direction', 'right', '--cwd', $launchDir, '--no-focus'
    )
    $ticketPaneId = [string]$split.result.pane.pane_id
}

Start-Agent $ticketPaneId | ConvertTo-Json -Depth 10 | Write-Output
