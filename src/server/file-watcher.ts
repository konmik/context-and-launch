import chokidar, { type FSWatcher } from 'chokidar';
import { gitSync } from './git.js';

interface WatcherState {
	watcher: FSWatcher;
	timer: ReturnType<typeof setTimeout> | null;
}

export class FileWatcher {
	private watchers = new Map<string, WatcherState>();

	watch(worktreeDir: string, debounceMs = 2000): void {
		if (this.watchers.has(worktreeDir)) return;

		let watcher: FSWatcher;
		try {
			watcher = chokidar.watch(worktreeDir, {
				ignoreInitial: true,
				ignored: /(^|[/\\])\./,
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
				try {
					gitSync(worktreeDir, 'add', '-A');
					const status = gitSync(worktreeDir, 'status', '--porcelain');
					if (status.trim()) {
						gitSync(worktreeDir, 'commit', '-m', 'auto: external changes');
					}
				} catch (err) {
					console.warn(`FileWatcher: auto-commit failed for ${worktreeDir}:`, err);
				}
			}, debounceMs);
		};

		watcher.on('add', debouncedCommit);
		watcher.on('change', debouncedCommit);
		watcher.on('unlink', debouncedCommit);
		watcher.on('addDir', debouncedCommit);
		watcher.on('unlinkDir', debouncedCommit);
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
		state.watcher.close().catch(() => {});
	}
}
