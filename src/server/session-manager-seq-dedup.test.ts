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

describe('SessionManager seq-based dedup on reconnect', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-seq-dedup-');
		projectDir = tmpDir('sm-seq-dedup-proj-');
		worktreeDir = tmpDir('sm-seq-dedup-wt-');
		dirs.push(configDir, projectDir, worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('reconnecting with since=3 returns only events with seq > 3, preventing duplicates', () => {
		const sm = new SessionManager(configDir);

		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);
		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Emit 5 stdout events, each gets a monotonically increasing seq
		for (let i = 1; i <= 5; i++) {
			proc.stdout!.emit(
				'data',
				JSON.stringify({ type: 'assistant:text', text: `chunk ${i}` }) + '\n'
			);
		}

		const buffer = sm.getEventBuffer('proj', 'ticket-1');
		const textEvents = buffer.filter(e => e.type === 'assistant:text');
		expect(textEvents.length).toBe(5);

		// Each event has a unique, strictly increasing seq
		for (let i = 1; i < textEvents.length; i++) {
			expect(textEvents[i].seq).toBeGreaterThan(textEvents[i - 1].seq);
		}

		// Simulate reconnect: client already received events with seq 1..3,
		// so it passes since=seq_of_third_event. The stream endpoint filters
		// with (event.seq ?? 0) > since.
		const sinceSeq = textEvents[2].seq; // seq of the 3rd text event

		// Apply the same filter the stream endpoint uses (line 20 of stream.ts)
		const replayed = buffer.filter(e => (e.seq ?? 0) > sinceSeq);
		const replayedText = replayed.filter(e => e.type === 'assistant:text');

		// Only events 4 and 5 should be replayed
		expect(replayedText.length).toBe(2);
		expect((replayedText[0].data as { text: string }).text).toBe('chunk 4');
		expect((replayedText[1].data as { text: string }).text).toBe('chunk 5');

		// No duplicates: events 1-3 are excluded
		const replayedTexts = replayedText.map(e => (e.data as { text: string }).text);
		expect(replayedTexts).not.toContain('chunk 1');
		expect(replayedTexts).not.toContain('chunk 2');
		expect(replayedTexts).not.toContain('chunk 3');

		// Verify no duplicate seq values exist in the full buffer
		const allSeqs = buffer.map(e => e.seq);
		const uniqueSeqs = new Set(allSeqs);
		expect(uniqueSeqs.size).toBe(allSeqs.length);
	});
});
