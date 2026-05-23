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

describe('SessionManager stale exit notification', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-stale-notify-');
		projectDir = tmpDir('sm-stale-notify-proj-');
		worktreeDir = tmpDir('sm-stale-notify-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('subscriber receives process_exit from old run after stop()+startOrResume() with no way to identify the source run', () => {
		const sm = new SessionManager(configDir);

		// Start run A
		const procA = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(procA as any);
		const resultA = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionIdA = resultA.sessionId;

		// Subscribe to events for this key -- capture the full event
		const received: Array<{ type: string; data: unknown; sessionId?: string }> = [];
		sm.subscribe('proj', 'ticket-1', (event) => {
			received.push({ type: event.type, data: event.data, sessionId: event.sessionId });
		});

		// Stop run A
		sm.stop('proj', 'ticket-1');

		// Start run B for the same key
		const procB = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(procB as any);
		const resultB = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		const sessionIdB = resultB.sessionId;
		expect(sessionIdB).not.toBe(sessionIdA);

		// Run B is alive
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Clear received events so we only see what happens next
		received.length = 0;

		// Old process A's exit callback fires
		procA.fireExit(1);

		// The subscriber received a process_exit event
		const exitEvents = received.filter(e => e.type === 'process_exit');
		expect(exitEvents.length).toBe(1);
		expect((exitEvents[0].data as { code: number }).code).toBe(1);

		// After the fix, the event carries the sessionId of the run that
		// emitted it, so the subscriber can tell this came from run A (old)
		// rather than run B (the active run).
		expect(exitEvents[0].sessionId).toBe(sessionIdA);
		expect(exitEvents[0].sessionId).not.toBe(sessionIdB);

		// Meanwhile run B is still alive
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);
	});
});
