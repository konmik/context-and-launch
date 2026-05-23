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
	stdout: EventEmitter;
	stderr: EventEmitter;
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

describe('SessionManager rapid sequential emit', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-rapid-');
		projectDir = tmpDir('sm-rapid-proj-');
		worktreeDir = tmpDir('sm-rapid-wt-');
		dirs.push(configDir, projectDir, worktreeDir);

		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('two stdout lines emitted in consecutive ticks are both persisted in order with no data loss', async () => {
		const sm = new SessionManager(configDir);
		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);

		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Simulate two consecutive stdout JSON lines (as readline would emit them).
		// In production, readline emits one "line" event per line; each fires on
		// a separate microtask/tick. We emit them synchronously here to simulate
		// the tightest possible timing.
		const line1 = JSON.stringify({ type: 'assistant:text', text: 'first message' });
		const line2 = JSON.stringify({ type: 'assistant:text', text: 'second message' });

		proc.stdout.emit('data', line1 + '\n');

		// Wait one tick to let readline process the first line and fire the
		// "line" callback, which calls emit() -> appendToHistory().
		await new Promise(resolve => setTimeout(resolve, 0));

		proc.stdout.emit('data', line2 + '\n');

		// Wait another tick for the second line to be processed.
		await new Promise(resolve => setTimeout(resolve, 0));

		const history = sm.getHistory('proj', 'ticket-1');

		// Filter to only the assistant:text events (ignore the initial prompt
		// events or any other bookkeeping events).
		const textEvents = history.filter(e => e.type === 'assistant:text');

		expect(textEvents).toHaveLength(2);
		expect((textEvents[0].data as any).text).toBe('first message');
		expect((textEvents[1].data as any).text).toBe('second message');

		// Verify ordering: seq of first event is less than seq of second.
		expect(textEvents[0].seq).toBeLessThan(textEvents[1].seq);

		// Verify the full history has no gaps: all seq numbers are strictly
		// increasing across all events.
		for (let i = 1; i < history.length; i++) {
			expect(history[i].seq).toBeGreaterThan(history[i - 1].seq);
		}
	});
});
