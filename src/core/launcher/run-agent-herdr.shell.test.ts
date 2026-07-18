import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT_PATH = path.resolve(
	__dirname, '../../../config-defaults/run-agent-herdr.ps1',
);
const tempDirs: string[] = [];

interface HarnessReport {
	calls: { args: string[] }[];
}

function makeHarness(): { dir: string; harness: string; report: string; agent: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-agent-herdr-'));
	tempDirs.push(dir);
	const harness = path.join(dir, 'harness.ps1');
	const report = path.join(dir, 'report.json');
	const agent = path.join(dir, 'probe-agent.ps1');
	fs.writeFileSync(agent, '');
	fs.writeFileSync(harness, String.raw`
param(
  [string]$TargetScript,
  [string]$ReportPath,
  [string]$Mode,
  [string]$WorkingDir,
  [string]$Prompt,
  [string]$MarkerPath,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$AgentCommand
)
$global:Calls = @()
$global:Stopped = $false
function global:Start-Sleep {}
function global:Get-CimInstance {
  return [pscustomobject]@{ Name = 'powershell.exe'; CommandLine = 'powershell.exe -NoExit' }
}
function global:herdr {
  $callArgs = @($args | ForEach-Object { [string]$_ })
  $global:Calls += ,([pscustomobject]@{ args = $callArgs })
  $verb = "$($callArgs[0]) $($callArgs[1])"
  $global:LASTEXITCODE = 0
  if ($verb -eq 'workspace list') {
    if ($Mode -eq 'create') {
      return '{"id":"test","result":{"workspaces":[]}}'
    }
    return '{"id":"test","result":{"workspaces":[{"workspace_id":"w1","label":"alpha"}]}}'
  }
  if ($verb -eq 'workspace create') {
    return '{"id":"test","result":{"workspace":{"workspace_id":"w1"},' +
      '"root_pane":{"pane_id":"w1:p1"}}}'
  }
  if ($verb -eq 'agent list') {
    if ($Mode -eq 'working') {
      return '{"id":"test","result":{"agents":[{"workspace_id":"w1",' +
        '"pane_id":"w1:p9","name":"alpha--st-47","agent_status":"working"}]}}'
    }
    if ($Mode -eq 'idle') {
      return '{"id":"test","result":{"agents":[{"workspace_id":"w1",' +
        '"pane_id":"w1:p9","name":"alpha--st-47","agent_status":"idle"}]}}'
    }
    return '{"id":"test","result":{"agents":[]}}'
  }
  if ($verb -eq 'agent start') {
    return '{"id":"test","result":{"agent":{"pane_id":"w1:p2"}}}'
  }
  if ($verb -eq 'pane process-info') {
    $foregroundPid = if ($global:Stopped) { $PID } else { 999999 }
    return (@{ id = 'test'; result = @{ process_info = @{
      shell_pid = $PID; foreground_processes = @(@{ pid = $foregroundPid })
    } } } | ConvertTo-Json -Depth 8 -Compress)
  }
  if ($verb -eq 'pane run') {
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'pane send-keys') {
    if ($callArgs[3] -eq 'ctrl+c') { $global:Stopped = $true }
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'pane close') {
    return '{"id":"test","result":{"type":"ok"}}'
  }
  throw "Unexpected Herdr call: $($callArgs -join ' ')"
}
$exitCode = 0
try {
  Push-Location -LiteralPath $WorkingDir
  & $TargetScript $Prompt 'ignored' $MarkerPath @AgentCommand
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
@{ calls = $global:Calls } |
  ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath
exit $exitCode
`);
	return { dir, harness, report, agent };
}

function runHarness(mode: 'create' | 'reuse' | 'idle' | 'working'): {
	status: number | null;
	stderr: string;
	report: HarnessReport;
} {
	const files = makeHarness();
	const marker = path.join(files.dir, 'running', 'alpha', 'st-47.json');
	const prompt = "hello\nmultiline 'world'";
	const result = spawnSync('powershell', [
		'-NoProfile', '-File', files.harness,
		SCRIPT_PATH, files.report, mode, files.dir,
		prompt, marker, files.agent, '--flag',
	], { encoding: 'utf-8' });
	return {
		status: result.status,
		stderr: result.stderr,
		report: JSON.parse(fs.readFileSync(files.report, 'utf-8')) as HarnessReport,
	};
}

afterEach(() => {
	while (tempDirs.length > 0) {
		fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
	}
});

describe.runIf(process.platform === 'win32')('run-agent-herdr.ps1', () => {
	it('creates a persistent pane and starts the agent as its child', () => {
		const result = runHarness('create');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls[3]).toEqual([
			'agent', 'start', 'alpha--st-47', '--cwd', expect.any(String),
			'--workspace', 'w1', '--no-focus', '--',
			expect.stringMatching(/powershell(?:\.exe)?$/i),
			'-NoLogo', '-NoProfile', '-NoExit',
		]);
		expect(calls).toContainEqual([
			'pane', 'run', 'w1:p2', expect.stringMatching(
				/\[string\]::Join\([^)]*'hello', 'multiline ''world'''\)\)/,
			),
		]);
		expect(calls.find(call => call[0] === 'pane' && call[1] === 'run')?.[3])
			.not.toContain('\n');
		expect(calls.at(-1)?.slice(0, 3)).toEqual(['pane', 'close', 'w1:p1']);
	});

	it('reuses the Project workspace', () => {
		const result = runHarness('reuse');
		expect(result.status, result.stderr).toBe(0);
		expect(result.report.calls.map(call => call.args.slice(0, 2).join(' ')))
			.not.toContain('workspace create');
	});

	it('restarts an idle agent process inside the same pane', () => {
		const result = runHarness('idle');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls).toContainEqual(['pane', 'send-keys', 'w1:p9', 'ctrl+c']);
		expect(calls.some(call => call[0] === 'agent' && call[1] === 'start')).toBe(false);
		expect(calls.some(call => call[0] === 'pane' && call[1] === 'close')).toBe(false);
		const restart = calls.find(call =>
			call[0] === 'pane' && call[1] === 'run' && call[3].includes('probe-agent.ps1'));
		expect(restart?.[2]).toBe('w1:p9');
		expect(restart?.[3]).toMatch(
			/\[string\]::Join\([^)]*'hello', 'multiline ''world'''\)\)/,
		);
		expect(restart?.[3]).not.toContain('\n');
	});

	it('rejects a working agent', () => {
		const result = runHarness('working');
		expect(result.status).toBe(64);
		expect(result.stderr).toContain('already has a Herdr agent (working)');
	});
});
