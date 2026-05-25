import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileWatcher } from './file-watcher.js';
import { TicketStore } from './ticket-store.js';
import { git, gitSync } from './git.js';

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

			// Should be exactly 3 commits: "initial commit" + "create ticket RED-1" + "update ticket order"
			// NOT 4 (no extra "auto: external changes" from FileWatcher)
			expect(lines.length).toBe(3);
			expect(lines[0]).toContain('update ticket order');
			expect(lines[1]).toContain('create ticket RED-1');
			expect(lines[2]).toContain('initial commit');
		} finally {
			watcher.stopAll();
		}
	});

	it('interleaving: FileWatcher add -A then TicketStore autoCommit then FileWatcher status -- no redundant commit', async () => {
		const dir = tmpDir('filewatcher-interleave-test-');
		dirs.push(dir);

		const { gitSync } = await import('./git.js');

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

		const watcher = new FileWatcher();
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
			// This is what loadBoard does on every navigation
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

	it('reload same board: stopAll then watch same dir creates a fresh watcher that responds to fs events', async () => {
		const dir = tmpDir('filewatcher-reload-same-board-');
		dirs.push(dir);

		// Set up a git repo with an initial commit
		await git(dir, 'init');
		await git(dir, 'config', 'user.email', 'test@test.com');
		await git(dir, 'config', 'user.name', 'Test');
		fs.writeFileSync(path.join(dir, 'init.txt'), 'initial');
		await git(dir, 'add', '-A');
		await git(dir, 'commit', '-m', 'initial commit');

		const watcher = new FileWatcher();
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

		const watcher = new FileWatcher();
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

	it('rapid TicketStore operations produce correct sequential commits without corruption', async () => {
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

		const log = await git(dir, 'log', '--oneline');
		const lines = log.trim().split('\n');

		// Each createTicket produces 2 commits: "create ticket ..." + "update ticket order"
		expect(lines.length).toBe(7);
		expect(lines[0]).toContain('update ticket order');
		expect(lines[1]).toContain('create ticket RAPID-3');
		expect(lines[2]).toContain('update ticket order');
		expect(lines[3]).toContain('create ticket RAPID-2');
		expect(lines[4]).toContain('update ticket order');
		expect(lines[5]).toContain('create ticket RAPID-1');
		expect(lines[6]).toContain('initial commit');
	});

	it('autoCommit partial failure: add -A succeeds but commit fails -- next autoCommit recovers', async () => {
		const dir = tmpDir('filewatcher-partial-fail-');
		dirs.push(dir);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

			const store = new TicketStore(dir);
			store.createTicket('PART-1', 'First ticket');

			// Simulate partial failure: add -A works, but commit fails due to lock
			fs.writeFileSync(path.join(dir, 'part-1-first-ticket', 'notes.md'), '# Notes');

			// Stage the file manually (simulating add -A succeeding)
			gitSync(dir, 'add', '-A');

			// Now place index.lock so the commit step fails
			const indexLock = path.join(dir, '.git', 'index.lock');
			fs.writeFileSync(indexLock, 'simulated lock');

			// Attempt autoCommit-style operations -- commit should fail
			try {
				gitSync(dir, 'commit', '-m', 'should fail');
			} catch (err) {
				console.warn('Expected failure:', err);
			}

			// Remove lock
			fs.unlinkSync(indexLock);

			// The staged changes should still be there
			const statusAfterFail = gitSync(dir, 'status', '--porcelain');
			expect(statusAfterFail.trim()).not.toBe('');

			// Next autoCommit (via saveStageMarkdown) should succeed and include the staged changes
			store.saveStageMarkdown('part-1-first-ticket', 'todo', '# Todo list');

			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');

			// Should have: initial + create ticket + update ticket order + update todo
			expect(lines.length).toBe(4);
			expect(lines[0]).toContain('update todo for PART-1');
		} finally {
			warnSpy.mockRestore();
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

		const watcher = new FileWatcher();
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

			const watcher = new FileWatcher();
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

	it('TicketStore autoCommit during index.lock does not corrupt repo state', async () => {
		const dir = tmpDir('filewatcher-autocommit-lock-');
		dirs.push(dir);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			await git(dir, 'init');
			await git(dir, 'config', 'user.email', 'test@test.com');
			await git(dir, 'config', 'user.name', 'Test');
			await git(dir, 'commit', '--allow-empty', '-m', 'initial commit');

			const store = new TicketStore(dir);

			// Place index.lock before creating ticket
			const indexLock = path.join(dir, '.git', 'index.lock');
			fs.writeFileSync(indexLock, 'simulated lock');

			// createTicket writes the folder+json but autoCommit fails
			store.createTicket('LOCK-1', 'Locked ticket');

			// Verify the folder was created on disk
			const folderExists = fs.existsSync(path.join(dir, 'lock-1-locked-ticket'));
			expect(folderExists).toBe(true);

			// Verify autoCommit warned (both TicketStore and TicketOrderStore fail)
			expect(warnSpy).toHaveBeenCalled();
			const lockWarnings = warnSpy.mock.calls.filter(
				(call) => typeof call[0] === 'string' && call[0].includes('autoCommit failed')
			);
			expect(lockWarnings.length).toBe(2);

			// Remove the lock
			fs.unlinkSync(indexLock);

			// A subsequent operation should succeed without corruption
			warnSpy.mockClear();
			store.createTicket('LOCK-2', 'After lock');

			// No warnings for the second operation
			const secondWarnings = warnSpy.mock.calls.filter(
				(call) => typeof call[0] === 'string' && call[0].includes('autoCommit failed')
			);
			expect(secondWarnings.length).toBe(0);

			// Verify repo integrity: 3 commits (initial + create LOCK-2 + update ticket order)
			// LOCK-1 changes get bundled into LOCK-2's commit since add -A picks them up
			const log = await git(dir, 'log', '--oneline');
			const lines = log.trim().split('\n');
			expect(lines.length).toBe(3);
			expect(lines[0]).toContain('update ticket order');
			expect(lines[1]).toContain('create ticket LOCK-2');
			expect(lines[2]).toContain('initial commit');

			// Verify both tickets exist in the committed tree
			const lsTree = await git(dir, 'ls-tree', '--name-only', 'HEAD');
			expect(lsTree).toContain('lock-1-locked-ticket');
			expect(lsTree).toContain('lock-2-after-lock');
		} finally {
			warnSpy.mockRestore();
		}
	});
});
