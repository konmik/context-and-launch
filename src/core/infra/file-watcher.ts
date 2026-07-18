import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { gitSync } from './git.js';

function isDotPathInside(worktreeDir: string, filePath: string): boolean {
	const relative = path.relative(worktreeDir, filePath);
	return relative.split(/[/\\]/).some((segment) => segment.startsWith('.'));
}

interface WatcherState {
	watcher: FSWatcher;
	timer: ReturnType<typeof setTimeout> | null;
}

export class FileWatcher {
	private watchers = new Map<string, WatcherState>();

	constructor(private readonly onWorktreeChange?: (worktreeDir: string) => void) {}

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
					gitSync(worktreeDir, 'add', '-A');
					const status = gitSync(worktreeDir, 'status', '--porcelain');
					if (status.trim()) {
						gitSync(worktreeDir, 'commit', '-m', 'auto: external changes');
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
		watcher.on('ready', () => {
			try {
				if (gitSync(worktreeDir, 'status', '--porcelain').trim()) {
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
