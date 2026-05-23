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

describe('SessionManager startOrResume with exited-but-not-yet-cleaned-up run', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-exited-');
		projectDir = tmpDir('sm-exited-proj-');
		worktreeDir = tmpDir('sm-exited-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('creates a new run when existing run has exitCode set but exit callback has not fired', () => {
		const sm = new SessionManager(configDir);

		// Start the first run
		const proc1 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc1 as any);
		const result1 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionId1 = result1.sessionId;
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Simulate the process exiting at the OS level: exitCode is set,
		// but the Node 'exit' event callback has NOT fired yet.
		proc1.exitCode = 1;

		// The idempotency guard checks exitCode -- it should see exitCode !== null
		// and fall through to create a new run instead of returning the old sessionId.
		const proc2 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc2 as any);
		const result2 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionId2 = result2.sessionId;

		// A new session should have been created, not the old one returned
		expect(sessionId2).not.toBe(sessionId1);

		// The new run should be active and running
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);
		expect(sm.getStatus('proj', 'ticket-1').sessionId).toBe(sessionId2);

		// Now fire the old exit callback (delayed). Because the identity check
		// (activeRuns.get(key) === run) was added in a prior fix, the old
		// callback should NOT delete the new run from activeRuns.
		proc1.fireExit(1);

		// The new run should still be active after the old exit callback fires
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);
		expect(sm.getStatus('proj', 'ticket-1').sessionId).toBe(sessionId2);

		// Clean up
		sm.stop('proj', 'ticket-1');
	});
});
