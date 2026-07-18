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

function Invoke-HerdrJson {
    param([string[]]$CommandArgs)
    $output = & herdr @CommandArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "herdr $($CommandArgs -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

$workspaceList = Invoke-HerdrJson @('workspace', 'list')
$matchingWorkspaces = @(
    $workspaceList.result.workspaces |
        Where-Object { $_.label -ceq $projectSlug }
)
if ($matchingWorkspaces.Count -gt 1) {
    throw "Multiple Herdr workspaces are labeled '$projectSlug'. Rename or close duplicates first."
}

if ($matchingWorkspaces.Count -eq 1) {
    $workspaceId = [string]$matchingWorkspaces[0].workspace_id
    $initialPaneId = ''
} else {
    $created = Invoke-HerdrJson @(
        'workspace', 'create', '--cwd', $launchDir,
        '--label', $projectSlug, '--no-focus'
    )
    $workspaceId = [string]$created.result.workspace.workspace_id
    $initialPaneId = [string]$created.result.root_pane.pane_id
}
if (-not $workspaceId) {
    throw "Herdr did not return a workspace id for Project '$projectSlug'."
}

$panesToCloseAfterStart = @()
if ($initialPaneId) {
    $panesToCloseAfterStart += $initialPaneId
}

$agentList = Invoke-HerdrJson @('agent', 'list')
$matchingAgents = @(
    $agentList.result.agents |
        Where-Object {
            $_.workspace_id -eq $workspaceId -and $_.name -ceq $agentName
        }
)
if ($matchingAgents.Count -gt 1) {
    $states = ($matchingAgents | ForEach-Object { [string]$_.agent_status }) -join ', '
    throw "Ticket '$ticketFolder' has multiple Herdr agents ($states). Close them before launching again."
}
if ($matchingAgents.Count -eq 1) {
    $existingAgent = $matchingAgents[0]
    $existingStatus = [string]$existingAgent.agent_status
    if ($existingStatus -cne 'idle') {
        throw "Ticket '$ticketFolder' already has a Herdr agent ($existingStatus). Close it before launching again."
    }
    $existingPaneId = [string]$existingAgent.pane_id
    if (-not $existingPaneId) {
        throw "Idle Herdr agent for Ticket '$ticketFolder' has no pane to close."
    }
    Invoke-HerdrJson @('agent', 'rename', $existingPaneId, '--clear') | Out-Null
    $panesToCloseAfterStart += $existingPaneId
}

$cleanPrompt = $initialPrompt -replace '<<ENTER>>', ''
$startArgs = @(
    'agent', 'start', $agentName,
    '--cwd', $launchDir,
    '--workspace', $workspaceId,
    '--no-focus', '--'
) + $agentCommand + @($cleanPrompt)

$startOutput = & herdr @startArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "herdr agent start failed: $($startOutput -join [Environment]::NewLine)"
}
foreach ($paneId in $panesToCloseAfterStart) {
    Invoke-HerdrJson @('pane', 'close', $paneId) | Out-Null
}
$startOutput | Write-Output
