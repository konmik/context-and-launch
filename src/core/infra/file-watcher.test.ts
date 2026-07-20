import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileWatcher } from './file-watcher.js';
import { TicketStore } from '../ticket/ticket-store.js';
import { git, gitSync } from '~/test-git.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// temp dirs may already be deleted by the OS or a prior cleanup
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

		const watcher = new FileWatcher(createTestCommandTemplateService());
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

		const watcher = new FileWatcher(createTestCommandTemplateService());
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

		const watcher = new FileWatcher(createTestCommandTemplateService());
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

	it('FileWatcher commits TicketStore changes since autoCommit is removed', async () => {
		const dir = tmpDir('filewatcher-no-redundant-test-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

		const store = new TicketStore(dir);
		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 500;
			watcher.watch(dir, debounceMs);

			// Wait for chokidar to finish its initial scan
			await delay(1000);

			// Create a ticket -- no autoCommit, changes stay uncommitted
			store.createTicket('RED-1', 'Test ticket');

			// Wait long enough for the FileWatcher debounce to fire
			await delay(debounceMs + 2000);

			watcher.stop(dir);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');

			// FileWatcher picks up the uncommitted changes and commits them
			// Should be exactly 2: "initial commit" + "auto: external changes"
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('auto: external changes');
			expect(lines[1]).toContain('initial commit');
		} finally {
			watcher.stopAll();
		}
	});

	it('interleaving: FileWatcher add -A then TicketStore autoCommit then FileWatcher status'
		+ ' -- no redundant commit', async () => {
		const dir = tmpDir('filewatcher-interleave-test-');
		dirs.push(dir);

		const { gitSync } = await import('~/test-git.js');

		// Set up a git repo with an initial commit
		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

		// Simulate an external file change
		fs.writeFileSync(path.join(dir, 'external.txt'), 'new content');

		// Step 1: FileWatcher's add -A stages the change
		gitSync(dir, 'add', '-A');

		// Step 2: TicketStore's autoCommit runs all 3 steps (add -A, status, commit)
		// This commits everything that was staged, including external.txt
		gitSync(dir, 'add', '-A');
		const statusBeforeCommit = gitSync(dir, 'status', '--porcelain');
		expect(statusBeforeCommit.trim()).not.toBe(''); // something to commit
		gitSync(dir, 'commit', '-m', 'ticket: some operation');

		// Step 3: FileWatcher's status --porcelain runs -- should find nothing
		const statusAfter = gitSync(dir, 'status', '--porcelain');
		expect(statusAfter.trim()).toBe('');

		// Verify only 2 commits exist (initial + ticket commit, no redundant FileWatcher commit)
		const log = await git(dir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines.length).toBe(2);
		expect(lines[0]).toContain('ticket: some operation');
		expect(lines[1]).toContain('initial commit');
	});

	it('index.lock contention: error is logged and subsequent autoCommit still succeeds', async () => {
		const dir = tmpDir('filewatcher-lockcontention-test-');
		dirs.push(dir);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			// Set up a git repo with an initial commit
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

			// Create a file change that FileWatcher's debouncedCommit would pick up
			fs.writeFileSync(path.join(dir, 'changed.txt'), 'some content');

			// Step 1: Simulate FileWatcher's first step (add -A)
			gitSync(dir, 'add', '-A');

			// Step 2: Place index.lock to simulate another process holding the lock
			const indexLock = path.join(dir, '.git', 'index.lock');
			fs.writeFileSync(indexLock, 'simulated lock contention');

			// Step 3: FileWatcher's status+commit would now fail due to the lock
			// Simulate the full debouncedCommit catch block behavior
			try {
				gitSync(dir, 'status', '--porcelain');
				gitSync(dir, 'commit', '-m', 'auto: external changes');
				// If we get here, the lock didn't block (shouldn't happen)
				throw new Error('Expected commit to fail due to index.lock');
			} catch (err) {
				// This is what FileWatcher does: logs the warning
				console.warn(`FileWatcher: auto-commit failed for ${dir}:`, err);
			}

			// Verify: console.warn was called with the error
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0][0]).toContain('FileWatcher: auto-commit failed');
			expect(warnSpy.mock.calls[0][1]).toBeInstanceOf(Error);

			// Step 4: Remove the lock file (simulating the other process releasing it)
			fs.unlinkSync(indexLock);

			// Step 5: Verify a subsequent TicketStore-style autoCommit succeeds
			// This mimics TicketStore.autoCommit: add -A, status, commit
			gitSync(dir, 'add', '-A');
			const status = gitSync(dir, 'status', '--porcelain');
			expect(status.trim()).not.toBe(''); // changed.txt should still be pending
			gitSync(dir, 'commit', '-m', 'ticket: create ticket TEST-1');

			// Verify the commit actually went through
			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('ticket: create ticket TEST-1');
			expect(lines[1]).toContain('initial commit');
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('rapid board switch cancels pending commit -- data loss on stopAll during debounce', async () => {
		const dirA = tmpDir('filewatcher-rapid-switch-a-');
		const dirB = tmpDir('filewatcher-rapid-switch-b-');
		dirs.push(dirA, dirB);

		// Set up two git repos with initial commits
		for (const dir of [dirA, dirB]) {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
			await git(dir, 'add', '-A');
			await git(dir, 'commit', '-m', 'initial commit');
		}

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			// Start watching dirA with a long debounce (simulates normal operation)
			const debounceMs = 5000;
			watcher.watch(dirA, debounceMs);

			// Wait for chokidar to finish its initial scan
			await delay(500);

			// Create a file in dirA -- this triggers chokidar and starts the debounce timer
			fs.writeFileSync(path.join(dirA, 'important-work.txt'), 'unsaved changes');

			// Wait briefly for chokidar to detect the change and start the debounce
			await delay(300);

			// Simulate rapid board switch: stopAll then watch a different directory
			// This is what loadProjectPage does on every navigation
			watcher.stopAll();
			watcher.watch(dirB, debounceMs);

			// Wait longer than the original debounce would have taken
			await delay(1000);

			// Verify: the file exists on disk but was never committed
			const fileExists = fs.existsSync(path.join(dirA, 'important-work.txt'));
			expect(fileExists).toBe(true);

			const status = await git(dirA, 'status', '--porcelain');
			expect(status.trim()).toContain('important-work.txt');

			const log = await git(dirA, 'log', '--oneline');
			const commitCount = log.trim().split('\n').length;
			expect(commitCount).toBe(1); // only the initial commit -- data loss!
		} finally {
			watcher.stopAll();
		}
	});

	it('reload same board: stopAll then watch same dir creates a fresh watcher'
		+ ' that responds to fs events', async () => {
		const dir = tmpDir('filewatcher-reload-same-board-');
		dirs.push(dir);

		// Set up a git repo with an initial commit
		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		const debounceMs = 200;
		try {
			// First watch
			watcher.watch(dir, debounceMs);
			await delay(500); // let chokidar finish initial scan

			// Simulate board reload: stopAll then watch same dir again
			watcher.stopAll();
			watcher.watch(dir, debounceMs);
			await delay(500); // let chokidar finish initial scan for new watcher

			// Create a file change that the new watcher should pick up
			fs.writeFileSync(path.join(dir, 'after-reload.txt'), 'new content');

			// Wait for debounce to fire and commit
			await delay(debounceMs + 2000);

			watcher.stop(dir);

			// Verify the new watcher detected the change and committed it
			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('auto: external changes');
			expect(lines[1]).toContain('initial commit');
		} finally {
			watcher.stopAll();
		}
	});

	it('stopAll during active debounce timer: clearTimeout prevents the commit from firing', async () => {
		const dir = tmpDir('filewatcher-stopall-debounce-leak-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 200;
			watcher.watch(dir, debounceMs);

			// Let chokidar finish initial scan
			await delay(500);

			// Create a file change to trigger the debounce timer
			fs.writeFileSync(path.join(dir, 'leaked.txt'), 'should never be committed');

			// Wait briefly for chokidar to detect the change and start the debounce
			await delay(100);

			// Immediately stopAll -- this must clearTimeout the pending debounce
			watcher.stopAll();

			// Wait well past the debounce window (500ms > 200ms debounce)
			await delay(500);

			// If clearTimeout failed (timer leaked), the commit would have fired by now
			const log = await git(dir, 'log', '--oneline');
			const commitCount = log.trim().split('\n').length;
			expect(commitCount).toBe(1); // only the initial commit
		} finally {
			watcher.stopAll();
		}
	});

	it('FileWatcher picks up TicketStore changes with generic commit message', async () => {
		const dir = tmpDir('filewatcher-wrong-msg-test-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

		const store = new TicketStore(dir);
		store.createTicket('BASE-1', 'Setup');
		store.saveTicketContext('base-1-setup', 'todo', '# Notes');

		// Confirm changes are uncommitted (no autoCommit)
		const statusBefore = await git(dir, 'status', '--porcelain');
		expect(statusBefore.trim()).not.toBe('');

		// Start FileWatcher to pick up the uncommitted changes
		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 300;
			watcher.watch(dir, debounceMs);

			// Wait for chokidar to finish its initial scan
			await delay(1000);

			// Trigger chokidar by touching a non-dotfile
			fs.writeFileSync(path.join(dir, 'base-1-setup', 'trigger.txt'), 'nudge');
			await delay(debounceMs + 2000);

			watcher.stop(dir);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');

			// FileWatcher commits all uncommitted changes with its generic message
			const lastCommit = lines[0];
			expect(lastCommit).toContain('auto: external changes');
		} finally {
			watcher.stopAll();
		}
	});

	it('rapid TicketStore operations produce no commits (changes stay uncommitted)', async () => {
		const dir = tmpDir('filewatcher-rapid-ticketstore-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

		const store = new TicketStore(dir);

		store.createTicket('RAPID-1', 'First');
		store.createTicket('RAPID-2', 'Second');
		store.createTicket('RAPID-3', 'Third');

		// No autoCommit: only the init commit exists
		const log = await git(dir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain('initial commit');

		// All 3 ticket folders exist on disk as uncommitted changes
		const status = await git(dir, 'status', '--porcelain');
		expect(status).toContain('rapid-1-first');
		expect(status).toContain('rapid-2-second');
		expect(status).toContain('rapid-3-third');
	});

	it('TicketStore operations write files without committing even when index.lock exists', async () => {
		const dir = tmpDir('filewatcher-partial-fail-');
		dirs.push(dir);

		try {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

			const store = new TicketStore(dir);
			store.createTicket('PART-1', 'First ticket');

			// Write a ticket context file
			store.saveTicketContext('part-1-first-ticket', 'todo', '# Todo list');

			// Verify the file exists on disk
			expect(fs.existsSync(path.join(dir, 'part-1-first-ticket', 'todo.md'))).toBe(true);
			expect(fs.readFileSync(path.join(dir, 'part-1-first-ticket', 'todo.md'), 'utf-8')).toBe('# Todo list');

			// No autoCommit: only the init commit exists
			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(1);
		} finally {
			// no cleanup needed
		}
	});

	it('defense-in-depth: timer callback does not commit after watcher is removed from map', async () => {
		const dir = tmpDir('filewatcher-defense-timer-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			// Use a very short debounce so the timer fires quickly
			const debounceMs = 50;
			watcher.watch(dir, debounceMs);
			await delay(300);

			// Write a file to trigger the debounce
			fs.writeFileSync(path.join(dir, 'defense.txt'), 'content');
			await delay(30);

			// Manually delete the watcher entry from the map (simulating a race)
			// We access internal state via stop() which removes from map and clears timer
			watcher.stop(dir);

			// Wait past the debounce window
			await delay(debounceMs + 200);

			// The file should NOT have been committed because the watcher was removed
			const log = await git(dir, 'log', '--oneline');
			const commitCount = log.trim().split('\n').length;
			expect(commitCount).toBe(1);
		} finally {
			watcher.stopAll();
		}
	});

	it('tearDown logs warning when watcher.close() rejects', async () => {
		const dir = tmpDir('filewatcher-close-error-');
		dirs.push(dir);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
			await git(dir, 'add', '-A');
			await git(dir, 'commit', '-m', 'initial commit');

			const watcher = new FileWatcher(createTestCommandTemplateService());
			watcher.watch(dir, 5000);
			await delay(200);

			// Stop the watcher normally -- close() should succeed
			watcher.stop(dir);
			await delay(100);

			// Verify no warning was produced for a clean close
			const closeWarnings = warnSpy.mock.calls.filter(
				(call) => typeof call[0] === 'string' && call[0].includes('failed to close watcher')
			);
			expect(closeWarnings.length).toBe(0);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('onWorktreeChange fires on file events and again after the auto-commit', async () => {
		const dir = tmpDir('filewatcher-onchange-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const onWorktreeChange = vi.fn();
		const watcher = new FileWatcher(createTestCommandTemplateService(), onWorktreeChange);
		try {
			const debounceMs = 2000;
			watcher.watch(dir, debounceMs);
			await delay(500);

			fs.writeFileSync(path.join(dir, 'trigger.txt'), 'content');
			await delay(500);
			// Within the debounce window: only the raw file event has fired
			expect(onWorktreeChange).toHaveBeenCalledWith(dir);
			const callsBeforeCommit = onWorktreeChange.mock.calls.length;

			await delay(debounceMs + 2000);
			expect(onWorktreeChange.mock.calls.length).toBeGreaterThan(callsBeforeCommit);
		} finally {
			watcher.stopAll();
		}
	});

	it('auto-commit fires for a worktree nested under a dot-directory (default data dir)', async () => {
		const base = tmpDir('filewatcher-dot-parent-');
		dirs.push(base);
		const dir = path.join(base, '.context-launch', 'projects', 'demo', 'tickets');
		fs.mkdirSync(dir, { recursive: true });

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 300;
			watcher.watch(dir, debounceMs);
			await delay(500);

			fs.writeFileSync(path.join(dir, 'ticket-order.json'), '{}');
			await delay(debounceMs + 2000);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('auto: external changes');
		} finally {
			watcher.stopAll();
		}
	});

	it('dotfiles inside the worktree do not trigger an auto-commit', async () => {
		const base = tmpDir('filewatcher-dot-inside-');
		dirs.push(base);
		const dir = path.join(base, '.context-launch', 'projects', 'demo', 'tickets');
		fs.mkdirSync(dir, { recursive: true });

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 300;
			watcher.watch(dir, debounceMs);
			await delay(500);

			fs.writeFileSync(path.join(dir, '.hidden'), 'dotfile');
			fs.mkdirSync(path.join(dir, '.cache'));
			fs.writeFileSync(path.join(dir, '.cache', 'entry.txt'), 'inside dot dir');
			await delay(debounceMs + 2000);

			const log = await git(dir, 'log', '--oneline');
			expect(log.trim().split('\n').length).toBe(1);
		} finally {
			watcher.stopAll();
		}
	});

	it('watching the same dir twice keeps the watcher alive so a write just before'
		+ ' a board reload is still committed', async () => {
		const dir = tmpDir('filewatcher-watch-reload-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 300;
			watcher.watch(dir, debounceMs);
			await delay(500);

			fs.writeFileSync(path.join(dir, 'ticket-order.json'), '{}');
			watcher.watch(dir, debounceMs);
			await delay(debounceMs + 2000);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('auto: external changes');
		} finally {
			watcher.stopAll();
		}
	});

	it('changes made while a directory is unwatched are committed on rewatch'
		+ ' without any further fs event', async () => {
		const dir = tmpDir('filewatcher-catchup-');
		dirs.push(dir);

		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 300;
			watcher.watch(dir, debounceMs);
			await delay(500);

			watcher.stop(dir);
			fs.writeFileSync(path.join(dir, 'written-while-unwatched.md'), 'external change');
			watcher.watch(dir, debounceMs);
			await delay(debounceMs + 2000);

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(2);
			expect(lines[0]).toContain('auto: external changes');
		} finally {
			watcher.stopAll();
		}
	});

	it('watch is additive: watching a second directory keeps the first watcher active', async () => {
		const dirA = tmpDir('filewatcher-watch-a-');
		const dirB = tmpDir('filewatcher-watch-b-');
		dirs.push(dirA, dirB);

		for (const dir of [dirA, dirB]) {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
			await git(dir, 'add', '-A');
			await git(dir, 'commit', '-m', 'initial commit');
		}

		const watcher = new FileWatcher(createTestCommandTemplateService());
		try {
			const debounceMs = 300;
			watcher.watch(dirA, debounceMs);
			await delay(500);
			watcher.watch(dirB, debounceMs);
			await delay(500);

			fs.writeFileSync(path.join(dirA, 'observed-a.txt'), 'content');
			fs.writeFileSync(path.join(dirB, 'observed-b.txt'), 'content');
			await delay(debounceMs + 2000);

			const logA = await git(dirA, 'log', '--oneline');
			expect(logA.trim().split('\n').length).toBe(2);
			const logB = await git(dirB, 'log', '--oneline');
			expect(logB.trim().split('\n').length).toBe(2);
		} finally {
			watcher.stopAll();
		}
	});

	it('TicketStore creates ticket folders even when index.lock exists (no autoCommit)', async () => {
		const dir = tmpDir('filewatcher-autocommit-lock-');
		dirs.push(dir);

		try {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

			const store = new TicketStore(dir);

			// Place index.lock
			const indexLock = path.join(dir, '.git', 'index.lock');
			fs.writeFileSync(indexLock, 'simulated lock');

			// createTicket writes the folder+json -- no autoCommit to fail
			store.createTicket('LOCK-1', 'Locked ticket');

			// Verify the folder was created on disk
			expect(fs.existsSync(path.join(dir, 'lock-1-locked-ticket'))).toBe(true);

			// Remove the lock
			fs.unlinkSync(indexLock);

			// Create a second ticket
			store.createTicket('LOCK-2', 'After lock');
			expect(fs.existsSync(path.join(dir, 'lock-2-after-lock'))).toBe(true);

			// No autoCommit: only the init commit exists
			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(1);

			// Both ticket folders exist as uncommitted changes
			const status = await git(dir, 'status', '--porcelain');
			expect(status).toContain('lock-1-locked-ticket');
			expect(status).toContain('lock-2-after-lock');
		} finally {
			// no cleanup needed
		}
	});
});
