import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TicketStore, toKebabCase } from './ticket-store.js';
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

async function createGitWorktree(): Promise<string> {
	const dir = tmpDir('ticket-store-test-');
	await git(dir, 'init');
	await git(dir, 'commit', '--allow-empty', '-m', 'init');
	return dir;
}

describe('TicketStore', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('toKebabCase produces correct folder names', () => {
		expect(toKebabCase('ABC-1 Fix Login')).toBe('abc-1-fix-login');
		expect(toKebabCase('DEF-2  Hello  World')).toBe('def-2-hello-world');
		expect(toKebabCase('  X-1 Test  ')).toBe('x-1-test');
		expect(toKebabCase('a/b/c')).toBe('a-b-c');
	});

	it('createTicket creates folder and status json', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('ABC-1', 'Fix Login');

		expect(ticket.number).toBe('ABC-1');
		expect(ticket.title).toBe('Fix Login');
		expect(ticket.status).toBe('todo');
		expect(ticket.folderName).toBe('abc-1-fix-login');
		expect(fs.existsSync(path.join(worktreeDir, 'abc-1-fix-login', 'status.json'))).toBe(true);
	});

	it('listTickets returns sorted results', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('C-3', 'Third');
		store.createTicket('A-1', 'First');
		store.createTicket('B-2', 'Second');

		const tickets = store.listTickets();
		expect(tickets.length).toBe(3);
		expect(tickets[0].number).toBe('A-1');
		expect(tickets[1].number).toBe('B-2');
		expect(tickets[2].number).toBe('C-3');
	});

	it('listTickets skips malformed entries', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('OK-1', 'Good Ticket');

		const badDir = path.join(worktreeDir, 'bad-ticket');
		fs.mkdirSync(badDir);
		fs.writeFileSync(path.join(badDir, 'status.json'), 'not valid json');

		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].number).toBe('OK-1');
	});

	it('updateTicket renames folder when title changes', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ABC-1', 'Old Title');

		const updated = store.updateTicket('abc-1-old-title', null, 'New Title', null);
		expect(updated.title).toBe('New Title');
		expect(updated.folderName).toBe('abc-1-new-title');
		expect(fs.existsSync(path.join(worktreeDir, 'abc-1-old-title'))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'abc-1-new-title'))).toBe(true);
	});

	it('deleteTicket removes folder', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('DEL-1', 'To Delete');
		expect(fs.existsSync(path.join(worktreeDir, 'del-1-to-delete'))).toBe(true);

		store.deleteTicket('del-1-to-delete');
		expect(fs.existsSync(path.join(worktreeDir, 'del-1-to-delete'))).toBe(false);
	});

	it('stage markdown read write roundtrip', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('MD-1', 'With Markdown');

		expect(store.getStageMarkdown('md-1-with-markdown', 'todo')).toBeNull();

		store.saveStageMarkdown('md-1-with-markdown', 'todo', '# My Notes\nSome content');
		const content = store.getStageMarkdown('md-1-with-markdown', 'todo');
		expect(content).toBe('# My Notes\nSome content');

		const ticket = store.listTickets()[0];
		expect(ticket.stageNames).toContain('todo');
	});

	it('createTicket rejects blank number or title', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		expect(() => store.createTicket('', 'Title')).toThrow();
		expect(() => store.createTicket('NUM', '')).toThrow();
	});

	it('createTicket appends suffix on folder name collision', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const first = store.createTicket('X-1', 'Same Name');
		const second = store.createTicket('X-1', 'Same Name');

		expect(first.folderName).toBe('x-1-same-name');
		expect(second.folderName).toBe('x-1-same-name-2');
		expect(fs.existsSync(path.join(worktreeDir, 'x-1-same-name'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'x-1-same-name-2'))).toBe(true);
	});

	it('H7.29 - two sequential createTicket calls with same number and title produce distinct folders via resolveUniqueFolderPath', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const first = store.createTicket('DUP-1', 'Same Title');
		const second = store.createTicket('DUP-1', 'Same Title');

		expect(first.folderName).toBe('dup-1-same-title');
		expect(second.folderName).toBe('dup-1-same-title-2');
		expect(fs.existsSync(path.join(worktreeDir, 'dup-1-same-title'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'dup-1-same-title-2'))).toBe(true);

		// Both tickets are independently readable with their own data
		const tickets = store.listTickets();
		expect(tickets.length).toBe(2);
		const folderNames = tickets.map((t) => t.folderName).sort();
		expect(folderNames).toEqual(['dup-1-same-title', 'dup-1-same-title-2']);
	});

	it('updateTicket renames folder when number changes', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('OLD-1', 'My Title');

		const updated = store.updateTicket('old-1-my-title', 'NEW-1', null, null);
		expect(updated.number).toBe('NEW-1');
		expect(updated.folderName).toBe('new-1-my-title');
		expect(fs.existsSync(path.join(worktreeDir, 'old-1-my-title'))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'new-1-my-title'))).toBe(true);
	});

	it('updateTicket on nonexistent folder throws', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		expect(() => store.updateTicket('no-such-folder', null, null, 'done')).toThrow();
	});

	it('deleteTicket on nonexistent folder throws', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		expect(() => store.deleteTicket('no-such-folder')).toThrow();
	});

	it('updateTicket rejects rename collision', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('A-1', 'First');
		store.createTicket('A-1', 'Second');

		expect(() => store.updateTicket('a-1-second', 'A-1', 'First', null)).toThrow();
	});

	it('saveStageMarkdown rejects path traversal in stage name', async () => {
		const parentDir = tmpDir('save-traversal-test-');
		dirs.push(parentDir);

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const store = new TicketStore(worktreeDir);
		store.createTicket('T-1', 'Test');

		expect(() => store.saveStageMarkdown('t-1-test', '../sibling/evil', 'pwned')).toThrow();

		const escaped = path.join(parentDir, 'sibling');
		expect(fs.existsSync(escaped)).toBe(false);
	});

	it('getStageMarkdown rejects path traversal in folderName', async () => {
		const parentDir = tmpDir('folder-traversal-test-');
		dirs.push(parentDir);

		const secretFile = path.join(parentDir, 'todo.md');
		fs.writeFileSync(secretFile, 'TOP SECRET DATA');

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const store = new TicketStore(worktreeDir);
		expect(() => store.getStageMarkdown('..', 'todo')).toThrow();
	});

	it('getStageMarkdown rejects path traversal in stage name', async () => {
		const parentDir = tmpDir('traversal-test-');
		dirs.push(parentDir);

		const secretFile = path.join(parentDir, 'secret.md');
		fs.writeFileSync(secretFile, 'TOP SECRET DATA');

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const store = new TicketStore(worktreeDir);
		store.createTicket('T-1', 'Test');

		expect(() => store.getStageMarkdown('t-1-test', '../../secret')).toThrow();
	});

	it('updateTicket rejects path traversal in folderName', async () => {
		const parentDir = tmpDir('update-traversal-test-');
		dirs.push(parentDir);

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const outsideDir = path.join(parentDir, 'target');
		fs.mkdirSync(outsideDir);

		const store = new TicketStore(worktreeDir);
		expect(() => store.updateTicket('../../target', null, null, 'done')).toThrow();

		expect(fs.existsSync(path.join(outsideDir, 'status.json'))).toBe(false);
	});

	it('saveStageMarkdown rejects stage name containing path separators', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('S-1', 'Slashes');

		expect(() => store.saveStageMarkdown('s-1-slashes', 'sub/dir', 'content')).toThrow();

		const subDir = path.join(worktreeDir, 's-1-slashes', 'sub');
		expect(fs.existsSync(subDir)).toBe(false);
	});

	it('deleteTicket rejects path traversal in folderName', async () => {
		const parentDir = tmpDir('delete-traversal-test-');
		dirs.push(parentDir);

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const outsideDir = path.join(parentDir, 'target');
		fs.mkdirSync(outsideDir);
		fs.writeFileSync(path.join(outsideDir, 'precious.txt'), 'important data');

		const store = new TicketStore(worktreeDir);
		expect(() => store.deleteTicket('../../target')).toThrow();

		expect(fs.existsSync(outsideDir)).toBe(true);
		expect(fs.existsSync(path.join(outsideDir, 'precious.txt'))).toBe(true);
	});

	it('autoCommit silently swallows index lock failure', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('LOCK-1', 'Lock Test');

		const statusBefore = await git(worktreeDir, 'status', '--porcelain');
		expect(statusBefore.trim()).toBe('');

		// Create index.lock to simulate concurrent git operation
		const dotGitPath = path.join(worktreeDir, '.git');
		const indexLock = path.join(dotGitPath, 'index.lock');
		fs.writeFileSync(indexLock, 'simulated lock');

		// This should not throw despite index.lock
		store.saveStageMarkdown('lock-1-lock-test', 'todo', '# Notes\nThis change will be lost');

		const stageFile = path.join(worktreeDir, 'lock-1-lock-test', 'todo.md');
		expect(fs.existsSync(stageFile)).toBe(true);
		expect(fs.readFileSync(stageFile, 'utf-8')).toBe('# Notes\nThis change will be lost');

		// Remove lock and check -- changes should be uncommitted
		fs.unlinkSync(indexLock);
		const statusAfter = await git(worktreeDir, 'status', '--porcelain');
		expect(statusAfter.trim()).not.toBe('');

		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).not.toContain('update todo');
	});

	it('two rapid autoCommit operations both produce commits with correct messages', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);

		// First operation: createTicket calls autoCommit with "create ticket RAP-1"
		const ticket = store.createTicket('RAP-1', 'Rapid Ops');

		// Second operation: saveStageMarkdown calls autoCommit with "update todo for RAP-1"
		store.saveStageMarkdown(ticket.folderName, 'todo', '# Todo\nDo the thing');

		// Verify both commits exist via git log
		const log = await git(worktreeDir, 'log', '--oneline');
		expect(log).toContain('create ticket RAP-1');
		expect(log).toContain('update todo for RAP-1');

		// Verify final state has both files
		const statusPath = path.join(worktreeDir, ticket.folderName, 'status.json');
		const stagePath = path.join(worktreeDir, ticket.folderName, 'todo.md');
		expect(fs.existsSync(statusPath)).toBe(true);
		expect(fs.existsSync(stagePath)).toBe(true);
		expect(fs.readFileSync(stagePath, 'utf-8')).toBe('# Todo\nDo the thing');

		// Verify working tree is clean -- no uncommitted changes
		const status = await git(worktreeDir, 'status', '--porcelain');
		expect(status.trim()).toBe('');
	});

	it('combined rename + status change writes correct status.json on disk', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('TK-1', 'Old Title');

		// Change title (triggers rename) and status in one call
		const updated = store.updateTicket('tk-1-old-title', null, 'New Title', 'in-progress');

		// Verify returned values
		expect(updated.number).toBe('TK-1');
		expect(updated.title).toBe('New Title');
		expect(updated.status).toBe('in-progress');
		expect(updated.folderName).toBe('tk-1-new-title');

		// Verify folder was renamed
		expect(fs.existsSync(path.join(worktreeDir, 'tk-1-old-title'))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'tk-1-new-title'))).toBe(true);

		// Verify status.json on disk contains all updated fields
		const statusJsonPath = path.join(worktreeDir, 'tk-1-new-title', 'status.json');
		const raw = fs.readFileSync(statusJsonPath, 'utf-8');
		const onDisk = JSON.parse(raw);
		expect(onDisk.number).toBe('TK-1');
		expect(onDisk.title).toBe('New Title');
		expect(onDisk.status).toBe('in-progress');
	});

	it('status-only change writes updated status.json without renaming folder', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-1', 'Keep Name');

		const updated = store.updateTicket('st-1-keep-name', null, null, 'in-progress');

		// Verify returned values
		expect(updated.number).toBe('ST-1');
		expect(updated.title).toBe('Keep Name');
		expect(updated.status).toBe('in-progress');
		expect(updated.folderName).toBe('st-1-keep-name');

		// Verify folder was NOT renamed
		expect(fs.existsSync(path.join(worktreeDir, 'st-1-keep-name'))).toBe(true);

		// Verify status.json on disk reflects the new status
		const statusJsonPath = path.join(worktreeDir, 'st-1-keep-name', 'status.json');
		const raw = fs.readFileSync(statusJsonPath, 'utf-8');
		const onDisk = JSON.parse(raw);
		expect(onDisk.number).toBe('ST-1');
		expect(onDisk.title).toBe('Keep Name');
		expect(onDisk.status).toBe('in-progress');
	});

	it('number + title change writes both new values to status.json and renames folder', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('OLD-1', 'Original Title');

		const updated = store.updateTicket('old-1-original-title', 'NEW-99', 'Changed Title', null);

		// Verify returned values
		expect(updated.number).toBe('NEW-99');
		expect(updated.title).toBe('Changed Title');
		expect(updated.status).toBe('todo');
		expect(updated.folderName).toBe('new-99-changed-title');

		// Verify old folder is gone and new folder exists
		expect(fs.existsSync(path.join(worktreeDir, 'old-1-original-title'))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'new-99-changed-title'))).toBe(true);

		// Verify status.json on disk contains both new values
		const statusJsonPath = path.join(worktreeDir, 'new-99-changed-title', 'status.json');
		const raw = fs.readFileSync(statusJsonPath, 'utf-8');
		const onDisk = JSON.parse(raw);
		expect(onDisk.number).toBe('NEW-99');
		expect(onDisk.title).toBe('Changed Title');
		expect(onDisk.status).toBe('todo');
	});

	it('updateTicket rejects ../sibling folderName traversal and leaves sibling untouched', async () => {
		const parentDir = tmpDir('update-sibling-traversal-');
		dirs.push(parentDir);

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		// Create a sibling directory outside worktreeDir that the traversal would target
		const siblingDir = path.join(parentDir, 'sibling');
		fs.mkdirSync(siblingDir);
		fs.writeFileSync(path.join(siblingDir, 'status.json'), JSON.stringify({
			number: 'LEGIT-1', title: 'Legit', status: 'todo'
		}));

		const store = new TicketStore(worktreeDir);

		// ../sibling resolves to the sibling directory outside worktreeDir
		expect(() => store.updateTicket('../sibling', null, null, 'done')).toThrow(
			/escapes allowed directory/
		);

		// Verify sibling directory was not modified
		const onDisk = JSON.parse(fs.readFileSync(path.join(siblingDir, 'status.json'), 'utf-8'));
		expect(onDisk.status).toBe('todo');
	});

	it('deleteTicket rejects ../../outside folderName and preserves outside directory', async () => {
		const parentDir = tmpDir('delete-outside-traversal-');
		dirs.push(parentDir);

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		// Create a directory two levels up that the traversal would target
		const outsideDir = path.join(parentDir, 'outside');
		fs.mkdirSync(outsideDir);
		fs.writeFileSync(path.join(outsideDir, 'status.json'), JSON.stringify({
			number: 'SECRET-1', title: 'Secret', status: 'todo'
		}));
		fs.writeFileSync(path.join(outsideDir, 'data.txt'), 'must survive');

		const store = new TicketStore(worktreeDir);

		// requireContained should reject ../../outside
		expect(() => store.deleteTicket('../../outside')).toThrow(
			/escapes allowed directory/
		);

		// Outside directory must be completely untouched
		expect(fs.existsSync(outsideDir)).toBe(true);
		expect(fs.readFileSync(path.join(outsideDir, 'data.txt'), 'utf-8')).toBe('must survive');
		const onDisk = JSON.parse(fs.readFileSync(path.join(outsideDir, 'status.json'), 'utf-8'));
		expect(onDisk.number).toBe('SECRET-1');
	});

	it('saveStageMarkdown with a folderName renamed away by updateTicket throws Ticket not found', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('STALE-1', 'Original Name');
		const oldFolder = ticket.folderName; // 'stale-1-original-name'

		// Rename the ticket by changing its title, which changes the folder name
		store.updateTicket(oldFolder, null, 'Renamed', null);

		// Old folder no longer exists; saving to it should throw
		expect(() => store.saveStageMarkdown(oldFolder, 'todo', '# stale write')).toThrow(
			/Ticket not found/
		);

		// Verify no stage file was written at the old path
		expect(fs.existsSync(path.join(worktreeDir, oldFolder, 'todo.md'))).toBe(false);
	});

	it('saveStageMarkdown to a recycled folderName writes to the wrong ticket (data corruption)', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);

		// Create ticket A with a known folderName
		const ticketA = store.createTicket('REC-1', 'Reusable Name');
		const originalFolder = ticketA.folderName; // 'rec-1-reusable-name'

		// Rename ticket A by changing its number, which changes the folder
		store.updateTicket(originalFolder, 'REC-99', null, null);

		// Old folder 'rec-1-reusable-name' no longer exists.
		// Now create ticket B whose kebab name collides with the old folder name.
		const ticketB = store.createTicket('REC-1', 'Reusable Name');
		expect(ticketB.folderName).toBe(originalFolder); // same kebab name recycled

		// A stale reference saves stage markdown using the original folderName.
		// This silently writes into ticket B's folder -- data corruption.
		store.saveStageMarkdown(originalFolder, 'todo', '# This was meant for ticket A');

		// The stage file lands in ticket B's directory, not ticket A's
		const stageInB = path.join(worktreeDir, ticketB.folderName, 'todo.md');
		expect(fs.existsSync(stageInB)).toBe(true);
		expect(fs.readFileSync(stageInB, 'utf-8')).toBe('# This was meant for ticket A');

		// Ticket A (now at rec-99-reusable-name) has no stage file -- the write went to the wrong ticket
		const renamedFolder = 'rec-99-reusable-name';
		const stageInA = path.join(worktreeDir, renamedFolder, 'todo.md');
		expect(fs.existsSync(stageInA)).toBe(false);
	});

	it('getStageMarkdown with a folderName that no longer exists returns null silently', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('GONE-1', 'Will Vanish');
		const oldFolder = ticket.folderName; // 'gone-1-will-vanish'

		// Write stage content while the ticket exists
		store.saveStageMarkdown(oldFolder, 'todo', '# Important notes');
		expect(store.getStageMarkdown(oldFolder, 'todo')).toBe('# Important notes');

		// Rename the ticket so the old folder disappears
		store.updateTicket(oldFolder, null, 'Vanished', null);
		expect(fs.existsSync(path.join(worktreeDir, oldFolder))).toBe(false);

		// getStageMarkdown with the stale folderName returns null instead of
		// throwing an error -- the caller has no way to distinguish "stage was
		// never written" from "ticket was renamed and content lives elsewhere"
		const result = store.getStageMarkdown(oldFolder, 'todo');
		expect(result).toBeNull();

		// Meanwhile the content still exists at the new path
		const newFolder = 'gone-1-vanished';
		expect(store.getStageMarkdown(newFolder, 'todo')).toBe('# Important notes');
	});

	it('saveStageMarkdown with undefined content throws TypeError from fs.writeFileSync', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('UNDEF-1', 'Undefined Test');

		// Bypass TypeScript to simulate a runtime caller passing undefined.
		// Node's fs.writeFileSync rejects undefined with a TypeError, so the
		// call does throw -- but with a low-level Node error rather than a
		// clear application-level message like "content must be a string".
		expect(() =>
			store.saveStageMarkdown('undef-1-undefined-test', 'notes', undefined as any)
		).toThrow(TypeError);
	});

	it('saveStageMarkdown with null content throws TypeError from fs.writeFileSync', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('NULL-1', 'Null Test');

		// Bypass TypeScript to simulate a runtime caller passing null.
		// Node's fs.writeFileSync rejects null with a TypeError, so the
		// call does throw -- but with a low-level Node error rather than a
		// clear application-level message like "content must be a string".
		expect(() =>
			store.saveStageMarkdown('null-1-null-test', 'notes', null as any)
		).toThrow(TypeError);
	});

	it('saveStageMarkdown with numeric content rejects non-string input', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('NUM-1', 'Numeric Test');

		// Bypass TypeScript to simulate a runtime caller passing a number.
		// Without an explicit guard, fs.writeFileSync silently coerces numbers
		// to strings, writing "123" to the file -- data corruption.
		expect(() =>
			store.saveStageMarkdown('num-1-numeric-test', 'notes', 123 as any)
		).toThrow(TypeError);
	});

	it('createTicket with undefined initialStatus defaults to todo', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		// Bypass TypeScript to simulate a runtime caller passing undefined
		const ticket = (store as any).createTicket('UNDEF-S1', 'Status Test', undefined);

		// Check the returned ticket object
		expect(ticket.status).toBe('todo');

		// Check what was actually written to disk
		const statusJsonPath = path.join(worktreeDir, ticket.folderName, 'status.json');
		const raw = fs.readFileSync(statusJsonPath, 'utf-8');
		const onDisk = JSON.parse(raw);

		// Verify the "status" key exists and has the default value
		expect('status' in onDisk).toBe(true);
		expect(onDisk.status).toBe('todo');

		// Also verify via listTickets
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].status).toBe('todo');
	});

	it('listTickets on a nonexistent worktreeDir returns empty array', () => {
		// Use a path inside a temp dir that was never created
		const base = tmpDir('nonexistent-parent-');
		dirs.push(base);
		const missing = path.join(base, 'does-not-exist');

		const store = new TicketStore(missing);
		const result = store.listTickets();

		// The implementation silently returns [] when the directory is missing.
		// This means a misconfigured worktreeDir produces the same result as
		// "no tickets yet" -- the caller cannot distinguish the two cases.
		expect(result).toEqual([]);
	});

	it('saveStageMarkdown on a nonexistent worktreeDir throws about the missing directory', () => {
		const base = tmpDir('nonexistent-save-');
		dirs.push(base);
		const missing = path.join(base, 'does-not-exist');

		const store = new TicketStore(missing);

		// When worktreeDir itself does not exist, requireContained calls
		// realpathSync on the missing parent, which throws a raw ENOENT.
		// The error should mention the worktree directory, not "Ticket not found".
		expect(() => store.saveStageMarkdown('some-folder', 'todo', 'content')).toThrow(
			/Worktree directory does not exist/
		);
	});

	it('getStageMarkdown on a nonexistent worktreeDir throws about the missing directory', () => {
		const base = tmpDir('nonexistent-get-');
		dirs.push(base);
		const missing = path.join(base, 'does-not-exist');

		const store = new TicketStore(missing);

		// When worktreeDir does not exist, requireContainedIn detects the
		// missing parent and throws a clear error. This is consistent with
		// saveStageMarkdown but inconsistent with listTickets (which returns []).
		expect(() => store.getStageMarkdown('some-folder', 'todo')).toThrow(
			/Worktree directory does not exist/
		);
	});

	it('deleteTicket on a nonexistent worktreeDir throws about the missing directory', () => {
		const base = tmpDir('nonexistent-delete-');
		dirs.push(base);
		const missing = path.join(base, 'does-not-exist');

		const store = new TicketStore(missing);

		// When worktreeDir itself does not exist, requireContained calls
		// requireContainedIn which detects the missing parent and throws
		// "Worktree directory does not exist" -- not "Ticket not found".
		expect(() => store.deleteTicket('some-folder')).toThrow(
			/Worktree directory does not exist/
		);
	});

	it('updateTicket case-only title change on case-insensitive filesystem', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ABC-1', 'My Title');

		const updated = store.updateTicket('abc-1-my-title', null, 'my title', null);
		expect(updated.title).toBe('my title');
		expect(updated.folderName).toBe('abc-1-my-title');
		expect(fs.existsSync(path.join(worktreeDir, 'abc-1-my-title'))).toBe(true);
	});

	it('readStatusJson with extra sessionId field: returned TicketInfo has only number/title/status', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);

		// Manually create a ticket directory with old-format status.json containing sessionId
		const folderName = 'old-1-has-session';
		const ticketDir = path.join(worktreeDir, folderName);
		fs.mkdirSync(ticketDir, { recursive: true });
		fs.writeFileSync(
			path.join(ticketDir, 'status.json'),
			JSON.stringify({
				number: 'OLD-1',
				title: 'Has Session',
				status: 'in-progress',
				sessionId: 'sess_abc123xyz'
			}, null, 2)
		);

		// listTickets uses readTicket which uses readStatusJson internally
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		const ticket = tickets[0];

		// The returned TicketInfo should have only the expected fields
		expect(ticket.number).toBe('OLD-1');
		expect(ticket.title).toBe('Has Session');
		expect(ticket.status).toBe('in-progress');
		expect(ticket.folderName).toBe(folderName);

		// readTicket constructs TicketInfo from status.number/title/status only,
		// so sessionId does not propagate to the returned object
		expect('sessionId' in ticket).toBe(false);
	});

	it('updateTicket on ticket with stale sessionId cleans it from status.json on disk', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);

		// Manually create a ticket with old-format status.json containing sessionId
		const folderName = 'stale-1-session-cleanup';
		const ticketDir = path.join(worktreeDir, folderName);
		fs.mkdirSync(ticketDir, { recursive: true });
		fs.writeFileSync(
			path.join(ticketDir, 'status.json'),
			JSON.stringify({
				number: 'STALE-1',
				title: 'Session Cleanup',
				status: 'todo',
				sessionId: 'sess_old_stale_value'
			}, null, 2)
		);

		// Update only the status -- this triggers readStatusJson then writeStatusJson
		const updated = store.updateTicket(folderName, null, null, 'done');
		expect(updated.number).toBe('STALE-1');
		expect(updated.title).toBe('Session Cleanup');
		expect(updated.status).toBe('done');

		// Read the raw file on disk -- writeStatusJson writes only number/title/status
		const raw = fs.readFileSync(path.join(ticketDir, 'status.json'), 'utf-8');
		const onDisk = JSON.parse(raw);
		expect(onDisk.number).toBe('STALE-1');
		expect(onDisk.title).toBe('Session Cleanup');
		expect(onDisk.status).toBe('done');

		// The stale sessionId field should be gone from the file
		expect('sessionId' in onDisk).toBe(false);
		expect(Object.keys(onDisk).sort()).toEqual(['number', 'status', 'title', 'useWorktree']);
	});

	it('listTickets with mixed old-format and new-format status.json files returns all correctly', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);

		// Create an old-format ticket (with sessionId) manually
		const oldDir = path.join(worktreeDir, 'mix-1-old-format');
		fs.mkdirSync(oldDir, { recursive: true });
		fs.writeFileSync(
			path.join(oldDir, 'status.json'),
			JSON.stringify({
				number: 'MIX-1',
				title: 'Old Format',
				status: 'in-progress',
				sessionId: 'sess_legacy_id_42'
			}, null, 2)
		);

		// Create a new-format ticket (without sessionId) via the normal API
		store.createTicket('MIX-2', 'New Format');

		// Create another old-format ticket manually
		const old2Dir = path.join(worktreeDir, 'mix-3-also-old');
		fs.mkdirSync(old2Dir, { recursive: true });
		fs.writeFileSync(
			path.join(old2Dir, 'status.json'),
			JSON.stringify({
				number: 'MIX-3',
				title: 'Also Old',
				status: 'done',
				sessionId: 'sess_another_legacy'
			}, null, 2)
		);

		const tickets = store.listTickets();
		expect(tickets.length).toBe(3);

		// Sorted by number: MIX-1, MIX-2, MIX-3
		expect(tickets[0].number).toBe('MIX-1');
		expect(tickets[0].title).toBe('Old Format');
		expect(tickets[0].status).toBe('in-progress');
		expect('sessionId' in tickets[0]).toBe(false);

		expect(tickets[1].number).toBe('MIX-2');
		expect(tickets[1].title).toBe('New Format');
		expect(tickets[1].status).toBe('todo');
		expect('sessionId' in tickets[1]).toBe(false);

		expect(tickets[2].number).toBe('MIX-3');
		expect(tickets[2].title).toBe('Also Old');
		expect(tickets[2].status).toBe('done');
		expect('sessionId' in tickets[2]).toBe(false);
	});

	it('two concurrent updateTicket calls on same ticket with different titles: second fails clearly', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('RACE-1', 'Original');

		const folderName = 'race-1-original';

		// Both calls target the same folderName. Since updateTicket is synchronous,
		// they execute sequentially: first renames the folder, second finds it gone.
		const results = await Promise.allSettled([
			Promise.resolve().then(() => store.updateTicket(folderName, null, 'Title A', null)),
			Promise.resolve().then(() => store.updateTicket(folderName, null, 'Title B', null)),
		]);

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');

		// Exactly one succeeds and one fails
		expect(fulfilled.length).toBe(1);
		expect(rejected.length).toBe(1);

		// The failure has a clear error message (not a cryptic ENOENT)
		const error = (rejected[0] as PromiseRejectedResult).reason;
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toMatch(/Ticket not found/);

		// The winner's folder exists at its new path
		const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
		const winnerDir = path.join(worktreeDir, winner.folderName);
		expect(fs.existsSync(winnerDir)).toBe(true);

		// The original folder is gone
		expect(fs.existsSync(path.join(worktreeDir, folderName))).toBe(false);

		// Only one ticket folder exists in the worktree
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].folderName).toBe(winner.folderName);
	});

	it('rename where old dir contains stage markdown files: .md files survive at the new path', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('MD-5', 'Has Stages');
		const oldFolder = ticket.folderName; // 'md-5-has-stages'

		// Add multiple stage markdown files
		store.saveStageMarkdown(oldFolder, 'to-do', '# To Do\n- item 1\n- item 2');
		store.saveStageMarkdown(oldFolder, 'product-requirement-document', '# PRD\nRequirements here');
		store.saveStageMarkdown(oldFolder, 'design', '# Design\nArchitecture notes');

		// Rename the ticket by changing its title
		const updated = store.updateTicket(oldFolder, null, 'Renamed Stages', null);
		const newFolder = updated.folderName; // 'md-5-renamed-stages'

		expect(newFolder).toBe('md-5-renamed-stages');
		expect(fs.existsSync(path.join(worktreeDir, oldFolder))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, newFolder))).toBe(true);

		// Verify all .md files exist at the new path with correct content
		expect(store.getStageMarkdown(newFolder, 'to-do')).toBe('# To Do\n- item 1\n- item 2');
		expect(store.getStageMarkdown(newFolder, 'product-requirement-document')).toBe('# PRD\nRequirements here');
		expect(store.getStageMarkdown(newFolder, 'design')).toBe('# Design\nArchitecture notes');

		// Verify readTicket (via listTickets) still returns the stage names
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].folderName).toBe(newFolder);
		expect(tickets[0].stageNames).toContain('to-do');
		expect(tickets[0].stageNames).toContain('product-requirement-document');
		expect(tickets[0].stageNames).toContain('design');
		expect(tickets[0].stageNames.length).toBe(3);
	});

	it('setUseWorktree persists to status.json and survives a re-read via listTickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('WT-1', 'Worktree Toggle');

		const folderName = 'wt-1-worktree-toggle';

		// Initially useWorktree is false
		let tickets = store.listTickets();
		expect(tickets[0].useWorktree).toBe(false);

		// Toggle it on
		store.setUseWorktree(folderName, true);

		// Re-reading from disk reflects the change
		tickets = store.listTickets();
		expect(tickets[0].useWorktree).toBe(true);

		// Raw file on disk confirms it
		const raw = JSON.parse(fs.readFileSync(path.join(worktreeDir, folderName, 'status.json'), 'utf-8'));
		expect(raw.useWorktree).toBe(true);

		// Toggle it back off
		store.setUseWorktree(folderName, false);
		tickets = store.listTickets();
		expect(tickets[0].useWorktree).toBe(false);
	});

	it('setUseWorktree does not clobber other status.json fields', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('WT-2', 'No Clobber');

		const folderName = 'wt-2-no-clobber';

		store.setUseWorktree(folderName, true);

		const raw = JSON.parse(fs.readFileSync(path.join(worktreeDir, folderName, 'status.json'), 'utf-8'));
		expect(raw.number).toBe('WT-2');
		expect(raw.title).toBe('No Clobber');
		expect(raw.status).toBe('todo');
		expect(raw.useWorktree).toBe(true);
	});

	it('writeStatusJson throws after successful rename: error propagates, folder at new path with stale status.json', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ERR-1', 'Before Rename');

		// The original status.json content (written by createTicket)
		const oldDir = path.join(worktreeDir, 'err-1-before-rename');
		const originalContent = fs.readFileSync(path.join(oldDir, 'status.json'), 'utf-8');
		const originalData = JSON.parse(originalContent);
		expect(originalData.title).toBe('Before Rename');

		// Spy on writeFileSync so it throws when writing status.json
		// (createTicket already ran, so the spy only intercepts the updateTicket write)
		const originalWriteFileSync = fs.writeFileSync;
		const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: any[]) => {
			const filePath = String(args[0]);
			if (filePath.endsWith('status.json')) {
				throw new Error('Simulated disk full');
			}
			return originalWriteFileSync.apply(fs, args as any);
		});

		try {
			// (a) Error propagates to caller
			expect(() => store.updateTicket('err-1-before-rename', null, 'After Rename', null)).toThrow(
				'Simulated disk full'
			);

			// (b) Folder exists at the new path (rename succeeded before the throw)
			const newDir = path.join(worktreeDir, 'err-1-after-rename');
			expect(fs.existsSync(newDir)).toBe(true);
			expect(fs.existsSync(oldDir)).toBe(false);

			// (c) status.json at new path has stale content (the write that would
			// update it was the one that threw, so it still has the old data)
			const staleContent = fs.readFileSync(path.join(newDir, 'status.json'), 'utf-8');
			const staleData = JSON.parse(staleContent);
			expect(staleData.title).toBe('Before Rename');
			expect(staleData.status).toBe('todo');
		} finally {
			spy.mockRestore();
		}
	});
});
