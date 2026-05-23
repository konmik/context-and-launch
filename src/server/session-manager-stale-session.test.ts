import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Readable, Writable } from 'stream';

vi.mock('child_process', async () => {
	const actual = await vi.importActual<typeof import('child_process')>('child_process');
	return {
		...actual,
		spawn: vi.fn(),
	};
});

import { spawn } from 'child_process';
import { SessionManager } from './session-manager.js';

const mockedSpawn = vi.mocked(spawn);

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
	}
}

function createFakeProcess(): EventEmitter & {
	pid: number;
	exitCode: number | null;
	stdin: Writable | null;
	stdout: Readable | null;
	stderr: Readable | null;
	kill: () => boolean;
	fireExit: (code: number) => void;
} {
	const emitter = new EventEmitter();
	const stdinEmitter = new EventEmitter();
	const stdoutEmitter = new EventEmitter();
	const stderrEmitter = new EventEmitter();

	(stdoutEmitter as any).resume = () => {};
	(stdoutEmitter as any).pause = () => {};
	(stdoutEmitter as any).setEncoding = () => {};
	(stderrEmitter as any).resume = () => {};
	(stderrEmitter as any).pause = () => {};
	(stderrEmitter as any).setEncoding = () => {};
	(stdinEmitter as any).write = vi.fn();
	(stdinEmitter as any).end = vi.fn();

	const fake = emitter as any;
	fake.pid = Math.floor(Math.random() * 100000) + 1000;
	fake.exitCode = null;
	fake.stdin = stdinEmitter;
	fake.stdout = stdoutEmitter;
	fake.stderr = stderrEmitter;
	fake.kill = vi.fn(() => true);

	fake.fireExit = (code: number) => {
		fake.exitCode = code;
		emitter.emit('exit', code);
	};

	return fake;
}

describe('SessionManager stale sessionId forces perpetual resume', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-stale-sid-');
		projectDir = tmpDir('sm-stale-sid-proj-');
		worktreeDir = tmpDir('sm-stale-sid-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('first call with sessionId=null spawns with --session-id; second call with returned sessionId spawns with --resume', () => {
		const sm = new SessionManager(configDir);

		// -- First run: sessionId=null (new session) --
		const proc1 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc1 as any);
		const result1 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionId = result1.sessionId;

		// Verify a UUID-shaped sessionId was generated
		expect(sessionId).toBeDefined();
		expect(typeof sessionId).toBe('string');
		expect(sessionId.length).toBeGreaterThan(0);

		// Verify spawn was called with --session-id (new session path)
		const firstCallArgs = mockedSpawn.mock.calls[0][1] as string[];
		expect(firstCallArgs).toContain('--session-id');
		expect(firstCallArgs).not.toContain('--resume');
		const sessionIdArgIdx = firstCallArgs.indexOf('--session-id');
		expect(firstCallArgs[sessionIdArgIdx + 1]).toBe(sessionId);

		// Verify the initial prompt was passed as a spawn arg (not stdin)
		const lastArg = firstCallArgs[firstCallArgs.length - 1];
		expect(lastArg).toContain('ticket-1');

		// -- Stop the process --
		proc1.fireExit(0);
		// After exit, the run is cleaned up from activeRuns
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// -- Second run: pass the same sessionId back (simulating what the run route does) --
		const proc2 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc2 as any);
		const result2 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, sessionId);

		// The returned sessionId must be the same
		expect(result2.sessionId).toBe(sessionId);

		// Verify spawn was called with --resume (resume path), NOT --session-id
		const secondCallArgs = mockedSpawn.mock.calls[1][1] as string[];
		expect(secondCallArgs).toContain('--resume');
		expect(secondCallArgs).not.toContain('--session-id');
		const resumeArgIdx = secondCallArgs.indexOf('--resume');
		expect(secondCallArgs[resumeArgIdx + 1]).toBe(sessionId);

		// Verify stdin was closed immediately (no stdin interaction)
		const stdinEnd2 = (proc2.stdin as any).end as ReturnType<typeof vi.fn>;
		expect(stdinEnd2).toHaveBeenCalled();

		// Clean up
		sm.stop('proj', 'ticket-1');
	});

	it('sessionId persists across multiple stop/resume cycles, always using --resume after the first run', () => {
		const sm = new SessionManager(configDir);

		// First run: new session
		const proc1 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc1 as any);
		const result1 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionId = result1.sessionId;

		const firstArgs = mockedSpawn.mock.calls[0][1] as string[];
		expect(firstArgs).toContain('--session-id');
		expect(firstArgs).not.toContain('--resume');

		// Stop
		proc1.fireExit(0);

		// Second run: resume with same sessionId
		const proc2 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc2 as any);
		const result2 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, sessionId);
		expect(result2.sessionId).toBe(sessionId);

		const secondArgs = mockedSpawn.mock.calls[1][1] as string[];
		expect(secondArgs).toContain('--resume');
		expect(secondArgs).not.toContain('--session-id');

		// Stop again
		proc2.fireExit(0);

		// Third run: still resume with same sessionId -- perpetual resume
		const proc3 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc3 as any);
		const result3 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, sessionId);
		expect(result3.sessionId).toBe(sessionId);

		const thirdArgs = mockedSpawn.mock.calls[2][1] as string[];
		expect(thirdArgs).toContain('--resume');
		expect(thirdArgs).not.toContain('--session-id');

		// The sessionId never changes -- once set, every run is a resume.
		// If the external claude session was lost, --resume with this sessionId
		// will still be attempted, with no way to reset to a fresh session
		// through the API.
		expect(result1.sessionId).toBe(result2.sessionId);
		expect(result2.sessionId).toBe(result3.sessionId);

		sm.stop('proj', 'ticket-1');
	});
});
