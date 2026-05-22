import chokidar from 'chokidar';
import { gitSync } from './git.js';

interface WatcherState {
	watcher: chokidar.FSWatcher;
	timer: ReturnType<typeof setTimeout> | null;
}

export class FileWatcher {
	private watchers = new Map<string, WatcherState>();

	watch(worktreeDir: string, debounceMs = 2000): void {
		if (this.watchers.has(worktreeDir)) return;

		let watcher: chokidar.FSWatcher;
		try {
			watcher = chokidar.watch(worktreeDir, {
				ignoreInitial: true,
				ignored: /(^|[/\\])\./,
				persistent: true,
				depth: 10
			});
		} catch {
			return;
		}

		const state: WatcherState = { watcher, timer: null };
		this.watchers.set(worktreeDir, state);

		const scheduleCommit = () => {
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
				} catch {
					// swallow
				}
			}, debounceMs);
		};

		watcher.on('add', scheduleCommit);
		watcher.on('change', scheduleCommit);
		watcher.on('unlink', scheduleCommit);
		watcher.on('addDir', scheduleCommit);
		watcher.on('unlinkDir', scheduleCommit);
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
