import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Readable, Writable } from 'stream';

// We mock child_process so spawn returns a controllable fake process
// instead of trying to run the real 'claude' binary.
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

/** Create a fake ChildProcess that can be controlled from the test. */
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

	// Give stdout/stderr a minimal Readable interface so createInterface works
	(stdoutEmitter as any).resume = () => {};
	(stdoutEmitter as any).pause = () => {};
	(stdoutEmitter as any).setEncoding = () => {};
	(stderrEmitter as any).resume = () => {};
	(stderrEmitter as any).pause = () => {};
	(stderrEmitter as any).setEncoding = () => {};

	// Give stdin write and end methods
	(stdinEmitter as any).write = vi.fn();
	(stdinEmitter as any).end = vi.fn();

	const fake = emitter as any;
	fake.pid = Math.floor(Math.random() * 100000) + 1000;
	fake.exitCode = null;
	fake.stdin = stdinEmitter;
	fake.stdout = stdoutEmitter;
	fake.stderr = stderrEmitter;
	fake.kill = vi.fn(() => true);

	// Helper to simulate process exit from the test
	fake.fireExit = (code: number) => {
		fake.exitCode = code;
		emitter.emit('exit', code);
	};

	return fake;
}

describe('SessionManager exit-callback race', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-race-');
		projectDir = tmpDir('sm-race-proj-');
		worktreeDir = tmpDir('sm-race-wt-');
		dirs.push(configDir, projectDir, worktreeDir);

		// Create the ticket folder expected by startOrResume
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('old exit callback deletes the NEW run after stop() + startOrResume()', () => {
		const sm = new SessionManager(configDir);

		// First spawn: create a fake process
		const proc1 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc1 as any);
		const result1 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Verify the run is active
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);
		const sessionId1 = result1.sessionId;

		// stop() kills proc1 and deletes the entry from activeRuns
		sm.stop('proj', 'ticket-1');
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// Immediately start a new run for the same key
		const proc2 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc2 as any);
		const result2 = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionId2 = result2.sessionId;
		expect(sessionId2).not.toBe(sessionId1);

		// New run should be active
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Now the old process's exit callback fires (async, from the killed proc1).
		// This is the bug: the old callback still has the same key and calls
		// activeRuns.delete(key), which removes the NEW run.
		proc1.fireExit(1);

		// BUG: getStatus now says not-running, even though proc2 is alive.
		// The test asserts the CORRECT behavior (should still be running).
		// If this fails, the bug exists.
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);
		expect(sm.getStatus('proj', 'ticket-1').sessionId).toBe(sessionId2);
	});
});
