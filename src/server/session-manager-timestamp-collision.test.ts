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

describe('SessionManager timestamp collision on reconnect', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-ts-collision-');
		projectDir = tmpDir('sm-ts-collision-proj-');
		worktreeDir = tmpDir('sm-ts-collision-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('seq-based filtering replays the second event even when two events share a timestamp', () => {
		// Force Date.now() to return the same value for all calls
		// so that two events get identical timestamps.
		const FIXED_TIME = 1700000000000;
		vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME);

		const sm = new SessionManager(configDir);

		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);
		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Emit two stdout lines -- both will get timestamp = FIXED_TIME
		// but each gets a distinct, monotonically increasing seq number.
		proc.stdout!.emit('data', JSON.stringify({ type: 'assistant:text', text: 'first chunk' }) + '\n');
		proc.stdout!.emit('data', JSON.stringify({ type: 'assistant:text', text: 'second chunk' }) + '\n');

		const buffer = sm.getEventBuffer('proj', 'ticket-1');

		// Find the two assistant:text events
		const textEvents = buffer.filter(e => e.type === 'assistant:text');
		expect(textEvents.length).toBe(2);

		// Both have the same timestamp (millisecond collision)
		expect(textEvents[0].timestamp).toBe(FIXED_TIME);
		expect(textEvents[1].timestamp).toBe(FIXED_TIME);

		// Each event has a distinct seq number
		expect(textEvents[0].seq).toBeDefined();
		expect(textEvents[1].seq).toBeDefined();
		expect(textEvents[1].seq).toBeGreaterThan(textEvents[0].seq);

		// OLD BUG: timestamp-based filtering (event.timestamp > since) with
		// since=FIXED_TIME would skip BOTH events, losing the second one.
		const timestampFiltered = buffer.filter(e => e.timestamp > FIXED_TIME);
		const timestampTextEvents = timestampFiltered.filter(e => e.type === 'assistant:text');
		expect(timestampTextEvents.length).toBe(0); // both skipped -- the old bug

		// FIX: seq-based filtering (event.seq > sinceSeq) correctly replays
		// the second event when the client passes the first event's seq.
		const firstEventSeq = textEvents[0].seq;
		const seqFiltered = buffer.filter(e => (e.seq ?? 0) > firstEventSeq);
		const seqTextEvents = seqFiltered.filter(e => e.type === 'assistant:text');
		expect(seqTextEvents.length).toBe(1); // only the second event is replayed
		expect((seqTextEvents[0].data as { text: string }).text).toBe('second chunk');
	});
});
