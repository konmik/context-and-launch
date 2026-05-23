import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Writable } from 'stream';

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

describe('SessionManager appendToHistory with corrupted history file', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-corrupt-');
		projectDir = tmpDir('sm-corrupt-proj-');
		worktreeDir = tmpDir('sm-corrupt-wt-');
		dirs.push(configDir, projectDir, worktreeDir);

		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('corrupted history file is silently reset: all prior events are lost, only the new event survives', async () => {
		const sm = new SessionManager(configDir);

		// -- Phase 1: Start a run and emit two real events to build history --
		const proc1 = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc1 as any);

		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		const line1 = JSON.stringify({ type: 'assistant:text', text: 'event one' });
		const line2 = JSON.stringify({ type: 'assistant:text', text: 'event two' });

		proc1.stdout.emit('data', line1 + '\n');
		await new Promise(resolve => setTimeout(resolve, 0));

		proc1.stdout.emit('data', line2 + '\n');
		await new Promise(resolve => setTimeout(resolve, 0));

		// Verify we have events in the history file (the two stdout events
		// plus any bookkeeping events from startOrResume).
		const historyBefore = sm.getHistory('proj', 'ticket-1');
		const textEventsBefore = historyBefore.filter(e => e.type === 'assistant:text');
		expect(textEventsBefore).toHaveLength(2);

		const totalEventsBefore = historyBefore.length;
		expect(totalEventsBefore).toBeGreaterThanOrEqual(2);

		// -- Phase 2: Corrupt the history file by writing invalid JSON --
		const historyFile = path.join(configDir, 'runs', 'proj', 'ticket-1.json');
		expect(fs.existsSync(historyFile)).toBe(true);

		// Overwrite with garbage that cannot be parsed as JSON.
		fs.writeFileSync(historyFile, '{this is not valid JSON!!! @@@ broken');

		// Verify getHistory also returns empty for corrupted file.
		const historyAfterCorruption = sm.getHistory('proj', 'ticket-1');
		expect(historyAfterCorruption).toEqual([]);

		// -- Phase 3: Emit one more event, triggering appendToHistory --
		// appendToHistory will try to JSON.parse the corrupted file, fail,
		// fall back to [], push the new event, and write only that event.
		const line3 = JSON.stringify({ type: 'assistant:text', text: 'event three' });
		proc1.stdout.emit('data', line3 + '\n');
		await new Promise(resolve => setTimeout(resolve, 0));

		// -- Phase 4: Read back and confirm data loss --
		const historyAfter = sm.getHistory('proj', 'ticket-1');

		// Only 1 event should exist: the new one. All prior history is gone.
		expect(historyAfter).toHaveLength(1);
		expect(historyAfter[0].type).toBe('assistant:text');
		expect((historyAfter[0].data as any).text).toBe('event three');

		// Confirm the prior events are truly gone: no trace of "event one"
		// or "event two" in the file.
		const rawContent = fs.readFileSync(historyFile, 'utf-8');
		expect(rawContent).not.toContain('event one');
		expect(rawContent).not.toContain('event two');

		// The file should be valid JSON now (appendToHistory rewrote it).
		const parsed = JSON.parse(rawContent);
		expect(parsed).toHaveLength(1);
	});
});
