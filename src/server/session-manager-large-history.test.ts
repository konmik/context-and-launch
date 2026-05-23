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

describe('SessionManager appendToHistory with 1000 pre-existing events', () => {
	const dirs: string[] = [];
	let configDir: string;
	let projectDir: string;
	let worktreeDir: string;

	beforeEach(() => {
		configDir = tmpDir('sm-large-');
		projectDir = tmpDir('sm-large-proj-');
		worktreeDir = tmpDir('sm-large-wt-');
		dirs.push(configDir, projectDir, worktreeDir);

		fs.mkdirSync(path.join(worktreeDir, 'ticket-1'), { recursive: true });
	});

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
		vi.restoreAllMocks();
	});

	it('the 1001st event is correctly appended and all 1001 events are present on disk', async () => {
		const sm = new SessionManager(configDir);

		// Pre-populate the history file with 1000 events written directly to disk.
		const historyDir = path.join(configDir, 'runs', 'proj');
		fs.mkdirSync(historyDir, { recursive: true });
		const historyFile = path.join(historyDir, 'ticket-1.json');

		const preExisting = [];
		for (let i = 1; i <= 1000; i++) {
			preExisting.push({
				timestamp: 1700000000000 + i,
				seq: i,
				type: 'assistant:text',
				data: { type: 'assistant:text', text: `event-${i}` },
			});
		}
		fs.writeFileSync(historyFile, JSON.stringify(preExisting, null, 2));

		// Sanity check: getHistory reads all 1000 events.
		const before = sm.getHistory('proj', 'ticket-1');
		expect(before).toHaveLength(1000);

		// Start a run so we can emit a stdout line through the mocked process.
		const proc = createFakeProcess();
		mockedSpawn.mockReturnValueOnce(proc as any);

		sm.startOrResume(projectDir, 'proj', 'ticket-1', worktreeDir, null);

		// Emit the 1001st event via a stdout line.
		const line = JSON.stringify({ type: 'assistant:text', text: 'event-1001' });
		proc.stdout.emit('data', line + '\n');
		await new Promise(resolve => setTimeout(resolve, 0));

		// Read back the history file from disk.
		const rawContent = fs.readFileSync(historyFile, 'utf-8');
		const allEvents = JSON.parse(rawContent);

		// The file should contain all 1001 events.
		expect(allEvents.length).toBeGreaterThanOrEqual(1001);

		// Verify the first 1000 pre-existing events are intact and in order.
		for (let i = 0; i < 1000; i++) {
			expect((allEvents[i].data as any).text).toBe(`event-${i + 1}`);
		}

		// Find the 1001st appended event (it may not be at index 1000 exactly
		// because startOrResume can strip user_queued events and re-write, but
		// the pre-existing events have type assistant:text so they survive).
		const event1001 = allEvents.find(
			(e: any) => e.type === 'assistant:text' && (e.data as any).text === 'event-1001'
		);
		expect(event1001).toBeDefined();

		// Verify ordering: the 1001st event appears after the 1000th.
		const idx1000 = allEvents.findIndex(
			(e: any) => e.type === 'assistant:text' && (e.data as any).text === 'event-1000'
		);
		const idx1001 = allEvents.findIndex(
			(e: any) => e.type === 'assistant:text' && (e.data as any).text === 'event-1001'
		);
		expect(idx1001).toBeGreaterThan(idx1000);

		// Verify total count: at least 1001 (exactly 1001 if no extra events
		// are injected by startOrResume for this history).
		const assistantEvents = allEvents.filter(
			(e: any) => e.type === 'assistant:text'
		);
		expect(assistantEvents).toHaveLength(1001);
	});
});
