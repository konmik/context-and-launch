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
  [string]$MarkerPath,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$AgentCommand
)
$global:HerdrTestCalls = @()
function global:herdr {
  $callArgs = @($args | ForEach-Object { [string]$_ })
  $global:HerdrTestCalls += ,([pscustomobject]@{ args = $callArgs })
  $verb = "$($callArgs[0]) $($callArgs[1])"
  $global:LASTEXITCODE = 0
  if ($verb -eq 'workspace list') {
    if ($Mode -eq 'create') {
      return '{"id":"test","result":{"type":"workspace_list","workspaces":[]}}'
    }
    return '{"id":"test","result":{"type":"workspace_list","workspaces":[{"workspace_id":"w1","label":"alpha"}]}}'
  }
  if ($verb -eq 'workspace create') {
    return '{"id":"test","result":{"type":"workspace_created",' +
      '"workspace":{"workspace_id":"w1","label":"alpha"},"root_pane":{"pane_id":"w1:p1"}}}'
  }
  if ($verb -eq 'pane close') {
    return '{"id":"test","result":{"type":"ok"}}'
  }
  if ($verb -eq 'agent list') {
    if ($Mode -eq 'duplicate') {
      return '{"id":"test","result":{"type":"agent_list","agents":' +
        '[{"workspace_id":"w1","pane_id":"w1:p2","name":' +
        '"alpha--st-47-herdr","agent_status":"working"}]}}'
    }
    if ($Mode -eq 'unnamed') {
      return '{"id":"test","result":{"type":"agent_list","agents":' +
        '[{"workspace_id":"w1","pane_id":"w1:p2","agent_status":"working"}]}}'
    }
    if ($Mode -eq 'idle') {
      return '{"id":"test","result":{"type":"agent_list","agents":' +
        '[{"workspace_id":"w1","pane_id":"w1:p9","name":' +
        '"alpha--st-47-herdr","agent_status":"idle"}]}}'
    }
    return '{"id":"test","result":{"type":"agent_list","agents":[]}}'
  }
  if ($verb -eq 'agent rename') {
    return '{"id":"test","result":{"type":"agent_info"}}'
  }
  if ($verb -eq 'agent start') {
    return '{"id":"test","result":{"type":"agent_started","agent":{"pane_id":"w1:p2"}}}'
  }
  throw "Unexpected Herdr call: $($callArgs -join ' ')"
}
$exitCode = 0
try {
  Push-Location -LiteralPath $WorkingDir
  & $TargetScript $Prompt 'ignored title' $MarkerPath @AgentCommand
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
@{ calls = $global:HerdrTestCalls } |
  ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath
exit $exitCode
`);
	return { dir, harness, report };
}

function runHarness(mode: 'create' | 'reuse' | 'duplicate' | 'idle' | 'unnamed'): {
	status: number | null;
	stderr: string;
	report: HarnessReport;
} {
	const files = makeHarness();
	const marker = path.join('C:\\state', 'running', 'alpha', 'st-47-herdr.json');
	const result = spawnSync('powershell', [
		'-NoProfile', '-File', files.harness,
		SCRIPT_PATH, files.report, mode, files.dir,
		'hello<<ENTER>>\nworld<<ENTER>>', marker,
		'codex1', '--flag',
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
	it('creates one Project workspace and starts the configured agent with marker tokens removed', () => {
		const result = runHarness('create');
		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr.trim()).toBe('');
		expect(result.report.calls.map(call => call.args)).toEqual([
			['workspace', 'list'],
			['workspace', 'create', '--cwd', expect.any(String), '--label', 'alpha', '--no-focus'],
			['agent', 'list'],
			[
				'agent', 'start', 'alpha--st-47-herdr',
				'--cwd', expect.any(String), '--workspace', 'w1', '--no-focus', '--',
				'codex1', '--flag', 'hello\nworld',
			],
			['pane', 'close', 'w1:p1'],
		]);
	});

	it('reuses the exact Project workspace instead of creating another', () => {
		const result = runHarness('reuse');
		expect(result.status, result.stderr).toBe(0);
		expect(result.report.calls.map(call => call.args.slice(0, 2).join(' ')))
			.toEqual(['workspace list', 'agent list', 'agent start']);
	});

	it('frees the idle agent name, starts fresh, then closes the old pane so the workspace survives', () => {
		const result = runHarness('idle');
		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr.trim()).toBe('');
		expect(result.report.calls.map(call => call.args.slice(0, 3).join(' ')))
			.toEqual([
				'workspace list', 'agent list',
				'agent rename w1:p9', 'agent start alpha--st-47-herdr',
				'pane close w1:p9',
			]);
	});

	it('ignores an unnamed agent under strict mode and starts the ticket agent', () => {
		const result = runHarness('unnamed');
		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr.trim()).toBe('');
		expect(result.report.calls.map(call => call.args.slice(0, 2).join(' ')))
			.toEqual(['workspace list', 'agent list', 'agent start']);
	});

	it('rejects an existing matching Ticket agent with a clean single-line stderr message', () => {
		const result = runHarness('duplicate');
		expect(result.status).toBe(64);
		expect(result.stderr).toContain('st-47-herdr');
		expect(result.stderr).toContain('working');
		expect(result.stderr).not.toContain('At ');
		expect(result.stderr).not.toContain('CategoryInfo');
		expect(result.report.calls.map(call => call.args.slice(0, 2).join(' ')))
			.toEqual(['workspace list', 'agent list']);
	});
});
