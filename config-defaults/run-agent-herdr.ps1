Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
trap {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 64
}

if ($args.Length -lt 4) {
    throw 'Usage: run-agent-herdr.ps1 <prompt> <title> <marker> <agent command...>'
}
if (-not (Get-Command herdr -ErrorAction SilentlyContinue)) {
    throw 'Herdr is not installed or is not available on PATH.'
}

$initialPrompt = [string]$args[0]
$markerPath = [string]$args[2]
$agentCommand = @($args[3..($args.Length - 1)] | ForEach-Object { [string]$_ })
$launchDir = (Get-Location).Path
$projectSlug = Split-Path -Leaf (Split-Path -Parent $markerPath)
$ticketFolder = [IO.Path]::GetFileNameWithoutExtension($markerPath)
$agentName = "$projectSlug--$ticketFolder"

function Invoke-Herdr {
    param([string[]]$CommandArgs)
    $output = & herdr @CommandArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "herdr $($CommandArgs -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

function Get-Field {
    param($Object, [string]$Name)
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) {
        return $Object.PSObject.Properties[$Name].Value
    }
    return $null
}

function ConvertTo-Literal {
    param([string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function ConvertTo-PromptExpression {
    param([string]$Value)
    $lines = @([regex]::Split($Value, '\r\n|\r|\n'))
    if ($lines.Count -eq 1) {
        return ConvertTo-Literal $Value
    }
    $quotedLines = ($lines | ForEach-Object { ConvertTo-Literal $_ }) -join ', '
    return "([string]::Join([Environment]::NewLine, @($quotedLines)))"
}

function Resolve-AgentCommand {
    param([string[]]$Command)
    $executable = Get-Command $Command[0] -ErrorAction Stop
    $tail = if ($Command.Length -gt 1) { @($Command[1..($Command.Length - 1)]) } else { @() }
    if ($executable.CommandType -eq 'ExternalScript') {
        $powershell = (Get-Command powershell -ErrorAction Stop).Source
        return @($powershell, '-NoProfile', '-File', $executable.Source) + $tail
    }
    return @($executable.Source) + $tail
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

function Test-PersistentPane {
    param($ProcessInfo)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($ProcessInfo.shell_pid)"
    return $process.Name -ieq 'powershell.exe' -and $process.CommandLine -match '(?i)-NoExit'
}

function Stop-AgentChild {
    param([string]$PaneId)
    Invoke-Herdr @('pane', 'send-keys', $PaneId, 'ctrl+c') | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        if (@(Get-ForegroundChildren (Get-PaneProcesses $PaneId)).Count -eq 0) {
            return
        }
        if ($attempt -eq 3) {
            Invoke-Herdr @('pane', 'send-keys', $PaneId, 'ctrl+c') | Out-Null
        }
    }
    throw "Agent in pane '$PaneId' did not stop."
}

function Start-AgentChild {
    param([string]$PaneId, [string[]]$Command, [string]$Prompt)
    $run = '& ' + (($Command | ForEach-Object { ConvertTo-Literal $_ }) -join ' ') +
        ' ' + (ConvertTo-PromptExpression $Prompt)
    Invoke-Herdr @('pane', 'run', $PaneId, $run) | Out-Null
}

$workspaceList = Invoke-Herdr @('workspace', 'list')
$workspaces = @($workspaceList.result.workspaces | Where-Object {
    (Get-Field $_ 'label') -ceq $projectSlug
})
if ($workspaces.Count -gt 1) {
    throw "Multiple Herdr workspaces are labeled '$projectSlug'."
}

$rootPaneToClose = ''
if ($workspaces.Count -eq 1) {
    $workspaceId = [string]$workspaces[0].workspace_id
} else {
    $created = Invoke-Herdr @(
        'workspace', 'create', '--cwd', $launchDir,
        '--label', $projectSlug, '--no-focus'
    )
    $workspaceId = [string]$created.result.workspace.workspace_id
    $rootPaneToClose = [string]$created.result.root_pane.pane_id
}

$agentList = Invoke-Herdr @('agent', 'list')
$agents = @($agentList.result.agents | Where-Object {
    (Get-Field $_ 'workspace_id') -eq $workspaceId -and
        (Get-Field $_ 'name') -ceq $agentName
})
if ($agents.Count -gt 1) {
    throw "Ticket '$ticketFolder' has multiple Herdr agents."
}

if ($agents.Count -eq 1) {
    $status = [string](Get-Field $agents[0] 'agent_status')
    if ($status -cne 'idle' -and $status -cne 'done') {
        throw "Ticket '$ticketFolder' already has a Herdr agent ($status)."
    }
    $paneId = [string](Get-Field $agents[0] 'pane_id')
    $processes = Get-PaneProcesses $paneId
    if (-not (Test-PersistentPane $processes)) {
        throw "Herdr pane '$paneId' cannot restart in place because it has no persistent shell."
    }
    Stop-AgentChild $paneId
    Start-AgentChild $paneId (Resolve-AgentCommand $agentCommand) $initialPrompt
    exit 0
}

$powershell = (Get-Command powershell -ErrorAction Stop).Source
$started = Invoke-Herdr (@(
    'agent', 'start', $agentName,
    '--cwd', $launchDir, '--workspace', $workspaceId, '--no-focus', '--'
) + @($powershell, '-NoLogo', '-NoProfile', '-NoExit'))
$paneId = [string]$started.result.agent.pane_id
Start-AgentChild $paneId (Resolve-AgentCommand $agentCommand) $initialPrompt

if ($rootPaneToClose) {
    Invoke-Herdr @('pane', 'close', $rootPaneToClose) | Out-Null
}
$started | ConvertTo-Json -Depth 10 | Write-Output
