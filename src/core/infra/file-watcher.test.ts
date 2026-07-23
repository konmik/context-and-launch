import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';
import {
	FileWatcher,
	type FileWatcherAdapters,
	type FileWatcherHandle,
} from './file-watcher.js';

class FakeWatcher implements FileWatcherHandle {
	private readonly listeners = new Map<string, Array<(...args: never[]) => void>>();
	readonly close = vi.fn(async () => {});

	on(event: string, callback: (...args: never[]) => void): this {
		const listeners = this.listeners.get(event) ?? [];
		listeners.push(callback);
		this.listeners.set(event, listeners);
		return this;
	}

	emit(event: string, ...args: never[]): void {
		for (const listener of this.listeners.get(event) ?? []) listener(...args);
	}
}

function createHarness(status = '') {
	const handles: FakeWatcher[] = [];
	const ignored: Array<(filePath: string) => boolean> = [];
	const commands = {
		execute: vi.fn(),
		executeSync: vi.fn((key: string) => key === 'git.status' ? status : ''),
		render: vi.fn(),
	} as unknown as CommandTemplateExecutor;
	const adapters: FileWatcherAdapters = {
		createWatcher: vi.fn((_dir, options) => {
			const handle = new FakeWatcher();
			handles.push(handle);
			ignored.push(options?.ignored as (filePath: string) => boolean);
			return handle;
		}),
		setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
		clearTimer: (timer) => clearTimeout(timer),
	};
	return { adapters, commands, handles, ignored };
}

describe('FileWatcher', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('creates one watcher per directory and permits additive watches', () => {
		const harness = createHarness();
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);

		watcher.watch('/one');
		watcher.watch('/one');
		watcher.watch('/two');

		expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2);
	});

	it('debounces file events, replaces the timer, and reports before and after commit', () => {
		const harness = createHarness(' M ticket.json');
		const onChange = vi.fn();
		const watcher = new FileWatcher(harness.commands, onChange, harness.adapters);
		watcher.watch('/repo', 200);

		harness.handles[0].emit('add');
		vi.advanceTimersByTime(100);
		harness.handles[0].emit('change');
		vi.advanceTimersByTime(199);
		expect(harness.commands.executeSync).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);

		expect(harness.commands.executeSync).toHaveBeenNthCalledWith(1, 'git.stage-all', '/repo');
		expect(harness.commands.executeSync).toHaveBeenNthCalledWith(2, 'git.status', '/repo');
		expect(harness.commands.executeSync).toHaveBeenNthCalledWith(
			3, 'git.commit', '/repo', { message: 'auto: external changes' },
		);
		expect(onChange).toHaveBeenCalledTimes(3);
	});

	it('does not create a redundant commit when staging leaves a clean status', () => {
		const harness = createHarness('');
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo', 10);

		harness.handles[0].emit('unlink');
		vi.runAllTimers();

		expect(harness.commands.executeSync).toHaveBeenCalledTimes(2);
		expect(harness.commands.executeSync).not.toHaveBeenCalledWith(
			'git.commit', expect.anything(), expect.anything(),
		);
	});

	it('cancels pending work on stop and creates a fresh watcher on rewatch', () => {
		const harness = createHarness(' M ticket.json');
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo', 10);
		harness.handles[0].emit('add');

		watcher.stop('/repo');
		vi.runAllTimers();
		watcher.watch('/repo', 10);

		expect(harness.handles[0].close).toHaveBeenCalledOnce();
		expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2);
		expect(harness.commands.executeSync).not.toHaveBeenCalled();
	});

	it('stopAll closes every watcher and cancels all pending work', () => {
		const harness = createHarness(' M ticket.json');
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/one', 10);
		watcher.watch('/two', 10);
		harness.handles[0].emit('add');
		harness.handles[1].emit('add');

		watcher.stopAll();
		vi.runAllTimers();

		expect(harness.handles.every((handle) => handle.close.mock.calls.length === 1)).toBe(true);
		expect(harness.commands.executeSync).not.toHaveBeenCalled();
	});

	it('catches up a non-dot change discovered when the watcher becomes ready', () => {
		const harness = createHarness(' M ticket.json\n?? nested/new.md');
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo', 10);

		harness.handles[0].emit('ready');
		vi.runAllTimers();

		expect(harness.commands.executeSync).toHaveBeenCalledWith('git.commit', '/repo', {
			message: 'auto: external changes',
		});
	});

	it('ignores dot-only ready changes, including quoted and nested paths', () => {
		const harness = createHarness('?? .hidden\n?? ".cache/entry.txt"');
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo', 10);

		harness.handles[0].emit('ready');
		vi.runAllTimers();

		expect(harness.commands.executeSync).toHaveBeenCalledOnce();
		expect(harness.commands.executeSync).toHaveBeenCalledWith('git.status', '/repo');
	});

	it('filters dot segments only inside the watched root', () => {
		const harness = createHarness();
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/parent/.context-launch/repo');

		expect(harness.ignored[0]('/parent/.context-launch/repo/ticket.json')).toBe(false);
		expect(harness.ignored[0]('/parent/.context-launch/repo/.git/index')).toBe(true);
		expect(harness.ignored[0]('/parent/.context-launch/repo/ticket/.cache/value')).toBe(true);
	});

	it('logs watcher creation, watcher events, catch-up, commit, and close failures', async () => {
		const harness = createHarness(' M ticket.json');
		const creationError = new Error('create failed');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(harness.adapters.createWatcher).mockImplementationOnce(() => {
			throw creationError;
		});
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/create-error');
		watcher.watch('/repo', 10);

		harness.handles[0].emit('error', new Error('watch error') as never);
		vi.mocked(harness.commands.executeSync).mockImplementationOnce(() => {
			throw new Error('ready failed');
		});
		harness.handles[0].emit('ready');
		harness.handles[0].emit('add');
		vi.mocked(harness.commands.executeSync).mockImplementationOnce(() => {
			throw new Error('commit failed');
		});
		vi.runAllTimers();
		harness.handles[0].close.mockRejectedValueOnce(new Error('close failed'));
		await watcher.stop('/repo');

		expect(warn.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([
			expect.stringContaining('failed to watch'),
			expect.stringContaining('watcher error'),
			expect.stringContaining('catch-up check failed'),
			expect.stringContaining('auto-commit failed'),
			expect.stringContaining('failed to close watcher'),
		]));
	});

	it('closes the watcher before an exclusive task runs and re-watches afterward', async () => {
		const harness = createHarness();
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo', 10);
		const order: string[] = [];
		harness.handles[0].close.mockImplementation(async () => {
			order.push('close');
		});

		const result = await watcher.runWithWatchPaused('/repo', () => {
			order.push('task');
			expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(1);
			return 'done';
		});

		expect(result).toBe('done');
		expect(order).toEqual(['close', 'task']);
		expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2);
	});

	it('re-watches even when the exclusive task throws', async () => {
		const harness = createHarness();
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo', 10);

		await expect(
			watcher.runWithWatchPaused('/repo', () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(harness.adapters.createWatcher).toHaveBeenCalledTimes(2);
	});

	it('runs an exclusive task without touching watchers when nothing is watched', async () => {
		const harness = createHarness();
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);

		const result = await watcher.runWithWatchPaused('/repo', () => 'ok');

		expect(result).toBe('ok');
		expect(harness.adapters.createWatcher).not.toHaveBeenCalled();
	});

	it('does not run a queued callback after its watcher is removed', () => {
		const harness = createHarness(' M ticket.json');
		let queuedCallback: (() => void) | undefined;
		harness.adapters.setTimer = vi.fn((callback) => {
			queuedCallback = callback;
			return 1 as unknown as ReturnType<typeof setTimeout>;
		});
		harness.adapters.clearTimer = vi.fn();
		const watcher = new FileWatcher(harness.commands, undefined, harness.adapters);
		watcher.watch('/repo');
		harness.handles[0].emit('add');

		watcher.stop('/repo');
		queuedCallback?.();

		expect(harness.commands.executeSync).not.toHaveBeenCalled();
	});
});
