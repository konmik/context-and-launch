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
function global:Start-Sleep {}
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
  if ($verb -eq 'pane run') {
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'pane send-keys') {
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
	const prompt = "<<ENTER>>hello\nmultiline 'world'<<ENTER>>";
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
	it('starts a new agent with the multiline prompt as one argv value', () => {
		const result = runHarness('create');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls[3]).toEqual([
			'agent', 'start', 'alpha--st-47', '--cwd', expect.any(String),
			'--workspace', 'w1', '--no-focus', '--',
			expect.stringMatching(/powershell(?:\.exe)?$/i),
			'-NoProfile', '-File', expect.stringMatching(/[\\/]probe-agent\.ps1$/), '--flag',
			"hello\nmultiline 'world'",
		]);
		expect(calls.some(call => call[0] === 'pane' && call[1] === 'run')).toBe(false);
		expect(calls.at(-1)?.slice(0, 3)).toEqual(['pane', 'close', 'w1:p1']);
	});

	it('reuses the Project workspace', () => {
		const result = runHarness('reuse');
		expect(result.status, result.stderr).toBe(0);
		expect(result.report.calls.map(call => call.args.slice(0, 2).join(' ')))
			.not.toContain('workspace create');
	});

	it('submits the multiline prompt to an idle agent without restarting it', () => {
		const result = runHarness('idle');
		expect(result.status, result.stderr).toBe(0);
		const calls = result.report.calls.map(call => call.args);
		expect(calls).toContainEqual([
			'pane', 'run', 'w1:p9', "hello\nmultiline 'world'",
		]);
		expect(calls).toContainEqual(['pane', 'send-keys', 'w1:p9', 'enter']);
		expect(calls.some(call => call[0] === 'agent' && call[1] === 'start')).toBe(false);
	});

	it('rejects a working agent', () => {
		const result = runHarness('working');
		expect(result.status).toBe(64);
		expect(result.stderr).toContain('already has a Herdr agent (working)');
	});
});
