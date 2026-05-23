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
	fireExit: (code: number | null) => void;
	fireError: (err: Error) => void;
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

	fake.fireExit = (code: number | null) => {
		fake.exitCode = code;
		emitter.emit('exit', code);
	};

	fake.fireError = (err: Error) => {
		emitter.emit('error', err);
	};

	return fake;
}

describe('SessionManager error+exit both fire for the same process', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-errex-');
		projectDir = tmpDir('sm-errex-proj-');
		worktreeDir = tmpDir('sm-errex-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('error callback followed by exit callback produces both events in history without crashing', () => {
		const sm = new SessionManager(configDir);
		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);

		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Simulate the Node.js ENOENT pattern: error fires first, then exit
		// fires with code null and signal null. This happens when spawn fails
		// to find the executable.
		const enoentError = new Error('spawn claude ENOENT');
		(enoentError as any).code = 'ENOENT';

		// Fire the error callback
		proc.fireError(enoentError);

		// After error, activeRuns should have deleted the run (identity check passes
		// because no new run was created).
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// Fire the exit callback (Node.js fires this after error for spawn failures).
		// The second delete should be harmless due to the identity check -- the run
		// was already removed, so activeRuns.get(key) !== run.
		expect(() => {
			proc.fireExit(null as any);
		}).not.toThrow();

		// Still not running
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// Read the history file and verify both events were recorded
		const history = sm.getHistory('proj', 'ticket-1');
		const errorEvents = history.filter(e => e.type === 'error');
		const exitEvents = history.filter(e => e.type === 'process_exit');

		// Both events should be present in the history
		expect(errorEvents.length).toBeGreaterThanOrEqual(1);
		expect(exitEvents.length).toBe(1);

		// The error event should contain the ENOENT message
		const spawnError = errorEvents.find(e =>
			(e.data as { message: string }).message.includes('ENOENT')
		);
		expect(spawnError).toBeDefined();

		// The exit event should have code null (spawn failure)
		expect((exitEvents[0].data as { code: number | null }).code).toBeNull();

		// Verify the total count: at minimum we have the error + process_exit
		// (there may also be other events from startOrResume, but the key point
		// is both error and process_exit are present)
		const relevantEvents = history.filter(
			e => e.type === 'error' || e.type === 'process_exit'
		);
		expect(relevantEvents.length).toBe(2);

		// Verify ordering: error comes before process_exit
		const errorIdx = history.findIndex(e =>
			e.type === 'error' && (e.data as { message: string }).message.includes('ENOENT')
		);
		const exitIdx = history.findIndex(e => e.type === 'process_exit');
		expect(errorIdx).toBeLessThan(exitIdx);
	});

	it('error+exit sequence does not interfere with a new run started after error', () => {
		const sm = new SessionManager(configDir);
		const proc1 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc1 as any);

		const result1 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Fire error on proc1 (simulating spawn failure discovered asynchronously)
		const err = new Error('spawn claude ENOENT');
		(err as any).code = 'ENOENT';
		proc1.fireError(err);

		// Run is gone from activeRuns
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// Start a new run for the same key before the old exit callback fires
		const proc2 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc2 as any);
		const result2 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		expect(result2.sessionId).not.toBe(result1.sessionId);
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Now the old proc1's exit callback fires (delayed by Node event loop)
		expect(() => {
			proc1.fireExit(null as any);
		}).not.toThrow();

		// The new run (proc2) should still be active -- the identity check
		// prevents the stale exit callback from deleting it
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);
		expect(sm.getStatus('proj', 'ticket-1').sessionId).toBe(result2.sessionId);
	});
});
