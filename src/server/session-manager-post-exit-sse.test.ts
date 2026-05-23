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

describe('SessionManager post-exit SSE reconnect behavior', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-post-exit-');
		projectDir = tmpDir('sm-post-exit-proj-');
		worktreeDir = tmpDir('sm-post-exit-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('after process exits, getEventBuffer returns [] and getHistory contains process_exit', () => {
		const sm = new SessionManager(configDir);

		// Start a run
		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);
		const { sessionId } = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Confirm run is active and buffer is non-empty (at least has startup events from history replay)
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(true);

		// Emit a stdout event so we have something in the buffer beyond just process_exit
		(proc.stdout as EventEmitter).emit('data', JSON.stringify({ type: 'assistant', text: 'hello' }) + '\n');

		// Wait a tick for readline to process
		// readline processes synchronously on emit, so getEventBuffer should have the event now
		const bufferBeforeExit = sm.getEventBuffer('proj', 'ticket-1');
		const assistantEvents = bufferBeforeExit.filter(e => e.type === 'assistant');
		expect(assistantEvents.length).toBe(1);

		// Fire the exit callback -- this emits process_exit, then deletes run from activeRuns
		proc.fireExit(0);

		// After exit: run is deleted from activeRuns
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// getEventBuffer returns [] because the run is no longer in activeRuns
		const bufferAfterExit = sm.getEventBuffer('proj', 'ticket-1');
		expect(bufferAfterExit).toEqual([]);

		// getHistory contains the process_exit event (persisted to disk)
		const history = sm.getHistory('proj', 'ticket-1');
		const exitEvents = history.filter(e => e.type === 'process_exit');
		expect(exitEvents.length).toBe(1);
		expect((exitEvents[0].data as { code: number }).code).toBe(0);
		expect(exitEvents[0].sessionId).toBe(sessionId);

		// The history also contains the assistant event
		const histAssistant = history.filter(e => e.type === 'assistant');
		expect(histAssistant.length).toBe(1);
	});

	it('subscriber registered after exit receives no events (process is dead)', () => {
		const sm = new SessionManager(configDir);

		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);
		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Fire exit
		proc.fireExit(0);
		expect(sm.getStatus('proj', 'ticket-1').running).toBe(false);

		// Subscribe AFTER exit
		const received: any[] = [];
		const unsub = sm.subscribe('proj', 'ticket-1', (event) => {
			received.push(event);
		});

		// Wait a bit (simulate time passing) -- no events should arrive
		// because the process is dead and nothing will call notify()
		expect(received).toEqual([]);

		// No events arrive because the process is dead and nothing calls notify

		unsub();
	});

	it('simulated SSE reconnect after exit: buffer is empty, history has all events', () => {
		const sm = new SessionManager(configDir);

		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);
		const { sessionId } = sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Emit some events while process is alive
		(proc.stdout as EventEmitter).emit('data', JSON.stringify({ type: 'event1', text: 'a' }) + '\n');
		(proc.stdout as EventEmitter).emit('data', JSON.stringify({ type: 'event2', text: 'b' }) + '\n');

		// A subscriber connected before exit receives events
		const liveEvents: any[] = [];
		const unsub = sm.subscribe('proj', 'ticket-1', (event) => {
			liveEvents.push(event);
		});

		// Fire exit
		proc.fireExit(0);

		// The live subscriber got the process_exit event
		const exitInLive = liveEvents.filter(e => e.type === 'process_exit');
		expect(exitInLive.length).toBe(1);

		unsub();

		// Now simulate SSE reconnect (what the stream endpoint does):
		// 1. getEventBuffer -- returns []
		const buffer = sm.getEventBuffer('proj', 'ticket-1');
		expect(buffer).toEqual([]);

		// 2. subscribe -- registered but will get nothing (process dead)
		const reconnectEvents: any[] = [];
		const unsub2 = sm.subscribe('proj', 'ticket-1', (event) => {
			reconnectEvents.push(event);
		});

		// 3. No events arrive
		expect(reconnectEvents).toEqual([]);

		// The client must fall back to the /history endpoint
		const history = sm.getHistory('proj', 'ticket-1');
		expect(history.length).toBeGreaterThanOrEqual(3); // event1, event2, process_exit
		const types = history.map(e => e.type);
		expect(types).toContain('event1');
		expect(types).toContain('event2');
		expect(types).toContain('process_exit');

		unsub2();
	});
});
