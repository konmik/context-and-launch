import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileWatcher } from './file-watcher.js';
import { TicketStore } from './ticket-store.js';
import { git } from './git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('FileWatcher', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('watch is idempotent -- second call for same directory does not error', async () => {
		const dir = tmpDir('filewatcher-idempotent-test-');
		dirs.push(dir);

		const watcher = new FileWatcher();
		try {
			watcher.watch(dir);
			await delay(50);
			watcher.watch(dir);
			await delay(50);
			watcher.stop(dir);
		} finally {
			watcher.stopAll();
		}
	});

	it('stop cancels a pending debounced commit before it executes', async () => {
		const dir = tmpDir('filewatcher-stop-cancel-test-');
		dirs.push(dir);

		const watcher = new FileWatcher();
		try {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
			await git(dir, 'add', '-A');
			await git(dir, 'commit', '-m', 'initial commit');

			const debounceMs = 500;
			watcher.watch(dir, debounceMs);
			await delay(200);

			fs.writeFileSync(path.join(dir, 'trigger.txt'), 'should not be committed');
			await delay(200);

			watcher.stop(dir);
			await delay(debounceMs + 500);

			const log = await git(dir, 'log', '--oneline');
			const commitCount = log.trim().split('\n').length;
			expect(commitCount).toBe(1);
		} finally {
			watcher.stopAll();
		}
	});

	it('stopAll stops all active watchers', async () => {
		const dirA = tmpDir('filewatcher-stopall-a-');
		const dirB = tmpDir('filewatcher-stopall-b-');
		dirs.push(dirA, dirB);

		const watcher = new FileWatcher();
		try {
			for (const dir of [dirA, dirB]) {
				await git(dir, 'init');
				await git(dir, 'config', 'user.email', 'test@test.com');
				await git(dir, 'config', 'user.name', 'Test');
				fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
				await git(dir, 'add', '-A');
				await git(dir, 'commit', '-m', 'initial commit');
			}

			const debounceMs = 500;
			watcher.watch(dirA, debounceMs);
			watcher.watch(dirB, debounceMs);
			await delay(200);

			fs.writeFileSync(path.join(dirA, 'trigger-a.txt'), 'should not be committed');
			fs.writeFileSync(path.join(dirB, 'trigger-b.txt'), 'should not be committed');
			await delay(200);

			watcher.stopAll();
			await delay(debounceMs + 500);

			for (const [label, dir] of [
				['A', dirA],
				['B', dirB]
			] as const) {
				const log = await git(dir, 'log', '--oneline');
				const commitCount = log.trim().split('\n').length;
				expect(commitCount, `Repo ${label}`).toBe(1);
			}
		} finally {
			watcher.stopAll();
		}
	});

	it('FileWatcher does not create a redundant commit after TicketStore autoCommit succeeds', async () => {
		const dir = tmpDir('filewatcher-no-redundant-test-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

		const store = new TicketStore(dir);
		const watcher = new FileWatcher();
		try {
			const debounceMs = 500;
			watcher.watch(dir, debounceMs);

			// Wait for chokidar to finish its initial scan
			await delay(1000);

			// Create a ticket -- TicketStore.autoCommit commits the new files immediately
			store.createTicket('RED-1', 'Test ticket');

			// Wait long enough for the FileWatcher debounce to fire
			await delay(debounceMs + 2000);

			watcher.stop(dir);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');

			// Should be exactly 2 commits: "initial commit" + "create ticket RED-1"
			// NOT 3 (no extra "auto: external changes" from FileWatcher)
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('create ticket RED-1');
			expect(lines[1]).toContain('initial commit');
		} finally {
			watcher.stopAll();
		}
	});

	it('autoCommit failure causes FileWatcher to commit with wrong message', async () => {
		const dir = tmpDir('filewatcher-wrong-msg-test-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

		const store = new TicketStore(dir);
		store.createTicket('BASE-1', 'Setup');

		// Place index.lock so the next autoCommit fails
		const indexLock = path.join(dir, '.git', 'index.lock');
		fs.writeFileSync(indexLock, 'simulated lock');

		// This writes the file but autoCommit silently fails
		store.saveStageMarkdown('base-1-setup', 'todo', '# Notes');

		// Remove the lock so git works again
		fs.unlinkSync(indexLock);

		// Confirm the change is uncommitted
		const statusBefore = await git(dir, 'status', '--porcelain');
		expect(statusBefore.trim()).not.toBe('');

		// Start FileWatcher with a short debounce to pick up the uncommitted changes
		const watcher = new FileWatcher();
		try {
			const debounceMs = 300;
			watcher.watch(dir, debounceMs);

			// Wait for chokidar to finish its initial scan
			await delay(1000);

			// Trigger chokidar by touching a non-dotfile so it schedules a commit.
			// The already-dirty files from the failed autoCommit will be included.
			fs.writeFileSync(path.join(dir, 'base-1-setup', 'trigger.txt'), 'nudge');
			await delay(debounceMs + 2000);

			watcher.stop(dir);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');

			// The last commit should be from FileWatcher with the generic message
			const lastCommit = lines[0];
			expect(lastCommit).toContain('auto: external changes');

			// The specific message "update todo for BASE-1" should NOT appear
			// in the FileWatcher commit -- it was lost when autoCommit failed
			expect(lastCommit).not.toContain('update todo');
		} finally {
			watcher.stopAll();
		}
	});
});
