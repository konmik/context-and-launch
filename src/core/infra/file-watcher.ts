import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

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
	watcher: FSWatcher;
	timer: ReturnType<typeof setTimeout> | null;
}

export class FileWatcher {
	private watchers = new Map<string, WatcherState>();

	constructor(
		private readonly commands: CommandTemplateExecutor,
		private readonly onWorktreeChange?: (worktreeDir: string) => void,
	) {}

	watch(worktreeDir: string, debounceMs = 2000): void {
		if (this.watchers.has(worktreeDir)) return;

		let watcher: FSWatcher;
		try {
			watcher = chokidar.watch(worktreeDir, {
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
			if (current.timer) clearTimeout(current.timer);
			current.timer = setTimeout(() => {
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

	stop(worktreeDir: string): void {
		const state = this.watchers.get(worktreeDir);
		if (!state) return;
		this.tearDown(state);
		this.watchers.delete(worktreeDir);
	}

	stopAll(): void {
		for (const state of this.watchers.values()) {
			this.tearDown(state);
		}
		this.watchers.clear();
	}

	private tearDown(state: WatcherState): void {
		if (state.timer) clearTimeout(state.timer);
		state.watcher.close().catch((err) => {
			console.warn('FileWatcher: failed to close watcher:', err);
		});
	}
}
