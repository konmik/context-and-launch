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

describe('SessionManager stop() event behavior', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-stop-evt-');
		projectDir = tmpDir('sm-stop-evt-proj-');
		worktreeDir = tmpDir('sm-stop-evt-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('stop() emits no event; process_exit only appears when the exit callback fires', () => {
		const sm = new SessionManager(configDir);
		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);

		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Collect all events emitted via the subscriber to observe what
		// happens at each step.
		const subscribedEvents: { type: string; data: unknown }[] = [];
		sm.subscribe('proj', 'ticket-1', (event) => {
			subscribedEvents.push({ type: event.type, data: event.data });
		});

		// Snapshot history before stop
		const historyBeforeStop = sm.getHistory('proj', 'ticket-1');
		const hadProcessExitBefore = historyBeforeStop.some(e => e.type === 'process_exit');
		expect(hadProcessExitBefore).toBe(false);

		// --- Call stop() ---
		sm.stop('proj', 'ticket-1');

		// After stop(), the run is removed from activeRuns
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// getEventBuffer returns [] because the run was deleted from activeRuns
		const bufferAfterStop = sm.getEventBuffer('proj', 'ticket-1');
		expect(bufferAfterStop).toEqual([]);

		// No process_exit or stopped event was emitted by stop() itself
		const historyAfterStop = sm.getHistory('proj', 'ticket-1');
		const processExitInHistory = historyAfterStop.filter(e => e.type === 'process_exit');
		const stoppedInHistory = historyAfterStop.filter(e => e.type === 'stopped');
		expect(processExitInHistory.length).toBe(0);
		expect(stoppedInHistory.length).toBe(0);

		// No events delivered to subscriber from stop()
		expect(subscribedEvents.filter(e => e.type === 'process_exit').length).toBe(0);
		expect(subscribedEvents.filter(e => e.type === 'stopped').length).toBe(0);

		// --- Now fire the deferred exit callback ---
		proc.fireExit(1);

		// The exit callback pushes process_exit into the OLD run's eventBuffer
		// and appends it to the history file via appendToHistory.
		const historyAfterExit = sm.getHistory('proj', 'ticket-1');
		const processExitAfterExit = historyAfterExit.filter(e => e.type === 'process_exit');
		expect(processExitAfterExit.length).toBe(1);
		expect((processExitAfterExit[0].data as { code: number }).code).toBe(1);

		// The subscriber also received the process_exit event
		const subscriberExitEvents = subscribedEvents.filter(e => e.type === 'process_exit');
		expect(subscriberExitEvents.length).toBe(1);
		expect((subscriberExitEvents[0].data as { code: number }).code).toBe(1);

		// getEventBuffer still returns [] because the run is not in activeRuns,
		// even though the old run object's eventBuffer has the event
		const bufferAfterExit = sm.getEventBuffer('proj', 'ticket-1');
		expect(bufferAfterExit).toEqual([]);
	});
});
