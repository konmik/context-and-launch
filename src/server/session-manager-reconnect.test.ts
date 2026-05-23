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

describe('SessionManager reconnect after brief network drop', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-reconnect-');
		projectDir = tmpDir('sm-reconnect-proj-');
		worktreeDir = tmpDir('sm-reconnect-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('events emitted during a network drop are buffered and replayed via since filter with no gap', () => {
		const sm = new SessionManager(configDir);

		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);
		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Phase 1: emit events 1-3 (client receives these normally)
		for (let i = 1; i <= 3; i++) {
			proc.stdout!.emit(
				'data',
				JSON.stringify({ type: 'assistant:text', text: `line ${i}` }) + '\n'
			);
		}

		// Snapshot the buffer after events 1-3
		const bufferAfterPhase1 = sm.getEventBuffer('proj', 'ticket-1');
		const textAfterPhase1 = bufferAfterPhase1.filter(e => e.type === 'assistant:text');
		expect(textAfterPhase1.length).toBe(3);

		// Record seq of event 2 as the last event the client received before
		// the simulated network drop. Event 3 was emitted server-side but
		// the client never received it (connection dropped mid-delivery).
		const lastReceivedSeq = textAfterPhase1[1].seq!;
		expect(lastReceivedSeq).toBeDefined();

		// Phase 2: emit events 4-5 while the client is disconnected
		// (the process keeps running, events accumulate in eventBuffer)
		for (let i = 4; i <= 5; i++) {
			proc.stdout!.emit(
				'data',
				JSON.stringify({ type: 'assistant:text', text: `line ${i}` }) + '\n'
			);
		}

		// Client reconnects and passes since=lastReceivedSeq (seq of event 2).
		// The stream endpoint replays events where (event.seq ?? 0) > since.
		const fullBuffer = sm.getEventBuffer('proj', 'ticket-1');
		const replayed = fullBuffer.filter(e => (e.seq ?? 0) > lastReceivedSeq);

		// The replayed set must contain text events for lines 3, 4, and 5.
		// Event 3 was emitted before the drop but after lastReceivedSeq=2,
		// so it must be included to avoid a gap.
		const replayedText = replayed.filter(e => e.type === 'assistant:text');
		expect(replayedText.length).toBe(3);

		const replayedLines = replayedText.map(e => (e.data as { text: string }).text);
		expect(replayedLines).toEqual(['line 3', 'line 4', 'line 5']);

		// Verify no gap: seq values are strictly increasing with no holes
		for (let i = 1; i < replayedText.length; i++) {
			expect(replayedText[i].seq).toBeGreaterThan(replayedText[i - 1].seq!);
		}

		// Events 1 and 2 (already received) must NOT be in the replayed set
		expect(replayedLines).not.toContain('line 1');
		expect(replayedLines).not.toContain('line 2');

		// The full buffer still contains all 5 events (nothing lost)
		const allText = fullBuffer.filter(e => e.type === 'assistant:text');
		expect(allText.length).toBe(5);
		const allLines = allText.map(e => (e.data as { text: string }).text);
		expect(allLines).toEqual(['line 1', 'line 2', 'line 3', 'line 4', 'line 5']);
	});
});
