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

function makeHarness(): { dir: string; harness: string; report: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-agent-herdr-'));
	tempDirs.push(dir);
	const harness = path.join(dir, 'harness.ps1');
	const report = path.join(dir, 'report.json');
	fs.writeFileSync(harness, String.raw`
param(
  [string]$TargetScript,
  [string]$ReportPath,
  [string]$Mode,
  [string]$WorkingDir,
  [string]$Prompt,
  [string]$WorkspaceLabel,
  [string]$PaneLabel,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$AgentCommand
)
$global:Calls = @()
$global:Stopped = $false
$global:QuitPending = $false
$global:AgentStarted = $false
$global:StartedPaneId = ''
function global:Start-Sleep {
  param([int]$Seconds, [int]$Milliseconds)
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
    if ($Mode -eq 'duplicate') {
      return '{"id":"test","result":{"workspaces":[' +
        '{"workspace_id":"w1","label":"alpha"},' +
        '{"workspace_id":"w2","label":"alpha"}]}}'
    }
    return '{"id":"test","result":{"workspaces":[{"workspace_id":"w1","label":"alpha"}]}}'
  }
  if ($verb -eq 'workspace create') {
    return '{"id":"test","result":{"workspace":{"workspace_id":"w1"},' +
      '"root_pane":{"pane_id":"w1:p1"}}}'
  }
  if ($verb -eq 'pane list') {
    if ($Mode -eq 'reuse' -or $Mode -eq 'duplicate') {
      return '{"id":"test","result":{"panes":[' +
        '{"workspace_id":"w1","pane_id":"w1:p1","label":"another-ticket"}]}}'
    }
    return '{"id":"test","result":{"panes":[' +
      '{"workspace_id":"w1","pane_id":"w1:p1","label":"another-ticket"},' +
      '{"workspace_id":"w1","pane_id":"w1:p9","label":"alpha--st-47"}]}}'
  }
  if ($verb -eq 'agent list') {
    if ($global:AgentStarted) {
      return '{"id":"test","result":{"agents":[{"workspace_id":"w1",' +
        '"pane_id":"' + $global:StartedPaneId + '","agent_status":"idle",' +
        '"agent":"opencode","state_change_seq":1}]}}'
    }
    if ($global:Stopped) {
      return '{"id":"test","result":{"agents":[]}}'
    }
    if ($Mode -eq 'working') {
      return '{"id":"test","result":{"agents":[{"workspace_id":"w1",' +
        '"pane_id":"w1:p9","agent_status":"working"}]}}'
    }
    if ($Mode -eq 'idle') {
      return '{"id":"test","result":{"agents":[{"workspace_id":"w1",' +
        '"pane_id":"w1:p9","agent_status":"idle"}]}}'
    }
    return '{"id":"test","result":{"agents":[]}}'
  }
  if ($verb -eq 'agent start') {
    return '{"id":"test","result":{"agent":{"agent_status":"idle"}}}'
  }
  if ($verb -eq 'agent prompt') {
    return '{"id":"test","result":{"agent":{"agent_status":"working"}}}'
  }
  if ($verb -eq 'agent rename' -or $verb -eq 'agent wait') {
    return '{"id":"test","result":{"agent":{"agent_status":"idle"}}}'
  }
  if ($verb -eq 'pane process-info') {
    $foregroundPid = if ($global:Stopped -or $Mode -eq 'empty') { $PID } else { 999999 }
    return (@{ id = 'test'; result = @{ process_info = @{
      shell_pid = $PID; foreground_processes = @(@{ pid = $foregroundPid; name = 'custom-agent.exe' })
    } } } | ConvertTo-Json -Depth 8 -Compress)
  }
  if ($verb -eq 'pane read') {
    return "composer: $Prompt"
  }
  if ($verb -eq 'pane run') {
    if ($callArgs[3] -eq '/quit') { $global:QuitPending = $true }
    if ($callArgs[3] -like 'powershell.exe -NoLogo -NoProfile -EncodedCommand *') {
      $global:AgentStarted = $true
      $global:StartedPaneId = $callArgs[2]
      $global:Stopped = $false
    }
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'pane send-keys') {
    if ($callArgs[3] -eq 'enter' -and $global:QuitPending) { $global:Stopped = $true }
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'pane rename') {
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'pane split') {
    return '{"id":"test","result":{"pane":{"pane_id":"w1:p2"}}}'
  }
  throw "Unexpected Herdr call: $($callArgs -join ' ')"
}
$exitCode = 0
try {
  Push-Location -LiteralPath $WorkingDir
  & $TargetScript $Prompt 'Fix login timeout ST-47 - Alpha' $WorkspaceLabel $PaneLabel @AgentCommand
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
@{ calls = $global:Calls } |
  ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath
exit $exitCode
`);
	return { dir, harness, report };
}

function runHarness(mode: 'create' | 'reuse' | 'duplicate' | 'idle' | 'empty' | 'working'): {
	status: number | null;
	stderr: string;
	report: HarnessReport;
} {
	const files = makeHarness();
	const prompt = "hello\nmultiline 'world'";
	const result = spawnSync('powershell', [
		'-NoProfile', '-File', files.harness,
		SCRIPT_PATH, files.report, mode, files.dir,
		prompt, 'alpha', 'alpha--st-47', 'claude', '--flag',
	], { encoding: 'utf-8' });
	return {
		status: result.status,
		stderr: result.stderr,
		report: JSON.parse(fs.readFileSync(files.report, 'utf-8')) as HarnessReport,
	};
}

function runHarnessWithoutPrompt(): ReturnType<typeof runHarness> {
	const files = makeHarness();
	const result = spawnSync('powershell', [
		'-NoProfile', '-File', files.harness,
		SCRIPT_PATH, files.report, 'create', files.dir,
		'', 'alpha', 'alpha--st-47', 'claude', '--flag',
	], { encoding: 'utf-8' });
	return {
		status: result.status,
		stderr: result.stderr,
		report: JSON.parse(fs.readFileSync(files.report, 'utf-8')) as HarnessReport,
	};
}

function runOpenCodeHarness(): ReturnType<typeof runHarness> {
	const files = makeHarness();
	const result = spawnSync('powershell', [
		'-NoProfile', '-File', files.harness,
		SCRIPT_PATH, files.report, 'create', files.dir,
		"hello\nmultiline 'world'", 'alpha', 'alpha--st-47', 'opencode', '--auto',
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
	it('uses a new workspace root pane for the Ticket agent', () => {
		const result = runHarness('create');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls).toContainEqual(['pane', 'rename', 'w1:p1', 'alpha--st-47']);
		const run = calls.find(call => call[0] === 'pane' && call[1] === 'run');
		const encoded = run?.[3].match(/-EncodedCommand (\S+)$/)?.[1];
		expect(Buffer.from(encoded!, 'base64').toString('utf16le')).toBe(
			"& 'claude' '--flag'",
		);
		expect(calls).toContainEqual([
			'agent', 'rename', 'w1:p1', 'Fix login timeout ST-47 - Alpha',
		]);
		expect(calls).toContainEqual([
			'agent', 'prompt', 'w1:p1', "hello\nmultiline 'world'",
		]);
		expect(calls.some(call => call.includes('--cwd') && call[0] === 'agent')).toBe(false);
	});

	it('splits a Ticket pane in an existing Project workspace', () => {
		const result = runHarness('reuse');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls.map(call => call.slice(0, 2).join(' ')))
			.not.toContain('workspace create');
		expect(calls).toContainEqual([
			'pane', 'split', 'w1:p1', '--direction', 'right',
			'--cwd', expect.any(String), '--no-focus',
		]);
		expect(calls.some(call =>
			call[0] === 'pane' && call[1] === 'run' && call[2] === 'w1:p2',
		)).toBe(true);
	});

	it('uses the first matching Project workspace when labels are duplicated', () => {
		const result = runHarness('duplicate');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls).toContainEqual(['pane', 'list', '--workspace', 'w1']);
		expect(calls.map(call => call.slice(0, 2).join(' ')))
			.not.toContain('workspace create');
	});

	it('starts without prompting when the initial prompt is empty', () => {
		const result = runHarnessWithoutPrompt();
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls.some(call => call[0] === 'pane' && call[1] === 'run')).toBe(true);
		expect(calls.some(call => call[0] === 'agent' && call[1] === 'prompt')).toBe(false);
	});

	it('runs the configured OpenCode command through the pane shell', () => {
		const result = runOpenCodeHarness();
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		const run = calls.find(call => call[0] === 'pane' && call[1] === 'run');
		expect(run?.slice(0, 3)).toEqual(['pane', 'run', 'w1:p1']);
		const encoded = run?.[3].match(
			/^powershell\.exe -NoLogo -NoProfile -EncodedCommand (\S+)$/,
		)?.[1];
		expect(encoded).toBeDefined();
		expect(Buffer.from(encoded!, 'base64').toString('utf16le')).toBe(
			"& 'opencode' '--auto'",
		);
		expect(calls.some(call => call[0] === 'agent' && call[1] === 'start')).toBe(false);
		expect(calls).toContainEqual([
			'agent', 'rename', 'w1:p1', 'Fix login timeout ST-47 - Alpha',
		]);
		expect(calls).toContainEqual(['pane', 'rename', 'w1:p1', 'alpha--st-47']);
		expect(calls).toContainEqual([
			'agent', 'prompt', 'w1:p1', "hello\nmultiline 'world'",
		]);
	});

	it('restarts an idle agent process inside the same pane', () => {
		const result = runHarness('idle');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls).toContainEqual(['pane', 'run', 'w1:p9', '/quit']);
		expect(calls).toContainEqual(['pane', 'send-keys', 'w1:p9', 'enter']);
		expect(calls).not.toContainEqual(['pane', 'send-keys', 'w1:p9', 'ctrl+c']);
		expect(calls.some(call => call[0] === 'pane' && call[1] === 'close')).toBe(false);
		expect(calls.some(call =>
			call[0] === 'pane' && call[1] === 'run' && call[2] === 'w1:p9' &&
			call[3] !== '/quit',
		)).toBe(true);
		expect(calls).toContainEqual([
			'agent', 'prompt', 'w1:p9', "hello\nmultiline 'world'",
		]);
	});

	it('starts an agent in an empty persistent Ticket pane', () => {
		const result = runHarness('empty');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls.some(call =>
			call[0] === 'pane' && call[1] === 'run' && call[2] === 'w1:p9',
		)).toBe(true);
	});

	it('rejects a working agent', () => {
		const result = runHarness('working');
		expect(result.status).toBe(64);
		expect(result.stderr).toContain("Ticket pane 'alpha--st-47' already has a Herdr agent (working)");
	});
});

// The mocked-function harness above cannot see how PowerShell treats a real
// program that writes to stderr, which is exactly where a failing Herdr call
// used to lose its context. These cases put a native `herdr` on PATH instead.
function runWithNativeStub(serverStatus: 'running' | 'not running', stderrLine: string): {
	status: number | null;
	stderr: string;
} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-agent-herdr-stub-'));
	tempDirs.push(dir);
	fs.writeFileSync(path.join(dir, 'herdr.cmd'), [
		'@echo off',
		'if "%1"=="status" (',
		'echo server:',
		`echo   status: ${serverStatus}`,
		'exit /b 0',
		')',
		`>&2 echo ${stderrLine}`,
		'exit /b 1',
		'',
	].join('\r\n'));
	const result = spawnSync('powershell', [
		'-NoProfile', '-File', SCRIPT_PATH,
		'prompt', 'title', 'alpha', 'alpha--st-47',
		'custom-agent', '--flag',
	], {
		encoding: 'utf-8',
		cwd: dir,
		env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ''}` },
	});
	return { status: result.status, stderr: result.stderr };
}

describe.runIf(process.platform === 'win32')('run-agent-herdr.ps1 Herdr failures', () => {
	it('names the unreachable Herdr server instead of leaking its transport error', () => {
		const result = runWithNativeStub(
			'not running',
			'Error: Os { code: 2, kind: NotFound, message: "The system cannot find the file specified." }',
		);
		expect(result.status).toBe(64);
		expect(result.stderr).toContain('Herdr is not running. Start Herdr, then launch the agent again.');
		expect(result.stderr).toContain('herdr workspace list exited 1');
		expect(result.stderr).toContain('kind: NotFound');
	});

	it('keeps the failing command with a failure Herdr itself reported', () => {
		const result = runWithNativeStub(
			'running',
			'{"error":{"code":"internal","message":"workspace list is broken"}}',
		);
		expect(result.status).toBe(64);
		expect(result.stderr).toContain('herdr workspace list failed: workspace list is broken');
	});
});
