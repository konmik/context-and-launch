import path from 'path';
import chokidar from 'chokidar';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

type WatcherEvent = 'ready' | 'error' | 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface FileWatcherHandle {
	on(event: 'ready', callback: () => void): FileWatcherHandle;
	on(event: 'error', callback: (error: unknown) => void): FileWatcherHandle;
	on(event: Exclude<WatcherEvent, 'ready' | 'error'>, callback: () => void): FileWatcherHandle;
	close(): Promise<void>;
}

export interface FileWatcherAdapters {
	createWatcher(
		worktreeDir: string,
		options: Parameters<typeof chokidar.watch>[1],
	): FileWatcherHandle;
	setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
	clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

const DEFAULT_ADAPTERS: FileWatcherAdapters = {
	createWatcher: (worktreeDir, options) => chokidar.watch(worktreeDir, options),
	setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimer: (timer) => clearTimeout(timer),
};

function hasDotSegment(relativePath: string): boolean {
	return relativePath.split(/[/\\]/).some((segment) => segment.startsWith('.'));
}

function isDotPathInside(worktreeDir: string, filePath: string): boolean {
	return hasDotSegment(path.relative(worktreeDir, filePath));
}

function statusEntryPath(statusLine: string): string | undefined {
	const entry = statusLine.slice(3);
	if (!entry) return undefined;
	const renameParts = entry.split(' -> ');
	return renameParts[renameParts.length - 1].replace(/^"(.*)"$/, '$1');
}

interface WatcherState {
	watcher: FileWatcherHandle;
	timer: ReturnType<typeof setTimeout> | null;
}

export class FileWatcher {
	private watchers = new Map<string, WatcherState>();

	constructor(
		private readonly commands: CommandTemplateExecutor,
		private readonly onWorktreeChange?: (worktreeDir: string) => void,
		private readonly adapters: FileWatcherAdapters = DEFAULT_ADAPTERS,
	) {}

	watch(worktreeDir: string, debounceMs = 2000): void {
		if (this.watchers.has(worktreeDir)) return;

		let watcher: FileWatcherHandle;
		try {
			watcher = this.adapters.createWatcher(worktreeDir, {
				ignoreInitial: true,
				ignored: (filePath: string) => isDotPathInside(worktreeDir, filePath),
				persistent: true,
				depth: 10
			});
		} catch (err) {
			console.warn(`FileWatcher: failed to watch ${worktreeDir}:`, err);
			return;
		}

		const state: WatcherState = { watcher, timer: null };
		this.watchers.set(worktreeDir, state);

		const debouncedCommit = () => {
			const current = this.watchers.get(worktreeDir);
			if (!current) return;
			if (current.timer) this.adapters.clearTimer(current.timer);
			current.timer = this.adapters.setTimer(() => {
				if (!this.watchers.has(worktreeDir)) return;
				try {
					this.commands.executeSync('git.stage-all', worktreeDir);
					const status = this.commands.executeSync('git.status', worktreeDir);
					if (status.trim()) {
						this.commands.executeSync('git.commit', worktreeDir, { message: 'auto: external changes' });
					}
				} catch (err) {
					console.warn(`FileWatcher: auto-commit failed for ${worktreeDir}:`, err);
				}
				this.onWorktreeChange?.(worktreeDir);
			}, debounceMs);
		};

		const handleEvent = () => {
			this.onWorktreeChange?.(worktreeDir);
			debouncedCommit();
		};

		// Files written before the initial scan completes are treated as initial
		// content by chokidar and never produce events; commit them on ready.
		// Dot paths are filtered like the event stream filters them, so a
		// dotfile-only change never triggers the catch-up commit.
		watcher.on('ready', () => {
			try {
				const hasNonDotChange = this.commands.executeSync('git.status', worktreeDir)
					.split('\n')
					.some((line) => {
						const entry = statusEntryPath(line);
						return entry !== undefined && !hasDotSegment(entry);
					});
				if (hasNonDotChange) {
					debouncedCommit();
				}
			} catch (err) {
				console.warn(`FileWatcher: catch-up check failed for ${worktreeDir}:`, err);
			}
		});
		watcher.on('error', (err) => {
			console.warn(`FileWatcher: watcher error for ${worktreeDir}:`, err);
		});
		watcher.on('add', handleEvent);
		watcher.on('change', handleEvent);
		watcher.on('unlink', handleEvent);
		watcher.on('addDir', handleEvent);
		watcher.on('unlinkDir', handleEvent);
	}

	async stop(worktreeDir: string): Promise<void> {
		const state = this.watchers.get(worktreeDir);
		if (!state) return;
		this.watchers.delete(worktreeDir);
		await this.tearDown(state);
	}

	async stopAll(): Promise<void> {
		const states = [...this.watchers.values()];
		this.watchers.clear();
		await Promise.all(states.map((state) => this.tearDown(state)));
	}

	async runWithWatchPaused<T>(worktreeDir: string, task: () => T | Promise<T>): Promise<T> {
		const wasWatching = this.watchers.has(worktreeDir);
		if (wasWatching) await this.stop(worktreeDir);
		try {
			return await task();
		} finally {
			if (wasWatching) this.watch(worktreeDir);
		}
	}

	private async tearDown(state: WatcherState): Promise<void> {
		if (state.timer) this.adapters.clearTimer(state.timer);
		try {
			await state.watcher.close();
		} catch (err) {
			console.warn('FileWatcher: failed to close watcher:', err);
		}
	}
}
