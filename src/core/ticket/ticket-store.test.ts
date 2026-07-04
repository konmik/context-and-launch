import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TicketStore, toKebabCase } from './ticket-store.js';
import { git, gitSync } from '../infra/git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch (err) {
			console.warn(`cleanup ${d}: ${err instanceof Error ? err.message : String(err)}`);
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

	it('ticket context read write roundtrip', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('MD-1', 'With Markdown');

		expect(store.getTicketContext('md-1-with-markdown', 'todo')).toBeNull();

		store.saveTicketContext('md-1-with-markdown', 'todo', '# My Notes\nSome content');
		const content = store.getTicketContext('md-1-with-markdown', 'todo');
		expect(content).toBe('# My Notes\nSome content');

		const ticket = store.listTickets()[0];
		expect(ticket.contextNames).toContain('todo');
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

	it('H7.29 - two sequential createTicket calls with same number and title'
		+ ' produce distinct folders via resolveUniqueFolderPath', async () => {
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

	it('saveTicketContext rejects path traversal in name', async () => {
		const parentDir = tmpDir('save-traversal-test-');
		dirs.push(parentDir);

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const store = new TicketStore(worktreeDir);
		store.createTicket('T-1', 'Test');

		expect(() => store.saveTicketContext('t-1-test', '../sibling/evil', 'pwned')).toThrow();

		const escaped = path.join(parentDir, 'sibling');
		expect(fs.existsSync(escaped)).toBe(false);
	});

	it('getTicketContext rejects path traversal in folderName', async () => {
		const parentDir = tmpDir('folder-traversal-test-');
		dirs.push(parentDir);

		const secretFile = path.join(parentDir, 'todo.md');
		fs.writeFileSync(secretFile, 'TOP SECRET DATA');

		const worktreeDir = path.join(parentDir, 'worktree');
		fs.mkdirSync(worktreeDir);
		await git(worktreeDir, 'init');
		await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');

		const store = new TicketStore(worktreeDir);
		expect(() => store.getTicketContext('..', 'todo')).toThrow();
	});

	it('getTicketContext rejects path traversal in name', async () => {
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

		expect(() => store.getTicketContext('t-1-test', '../../secret')).toThrow();
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

	it('saveTicketContext rejects name containing path separators', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('S-1', 'Slashes');

		expect(() => store.saveTicketContext('s-1-slashes', 'sub/dir', 'content')).toThrow();

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

	it('ticket mutations leave changes uncommitted in worktree', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('LOCK-1', 'Lock Test');

		// With autoCommit removed, changes stay uncommitted
		const statusAfterCreate = await git(worktreeDir, 'status', '--porcelain');
		expect(statusAfterCreate.trim()).not.toBe('');

		store.saveTicketContext('lock-1-lock-test', 'todo', '# Notes\nSome content');

		const docFile = path.join(worktreeDir, 'lock-1-lock-test', 'todo.md');
		expect(fs.existsSync(docFile)).toBe(true);
		expect(fs.readFileSync(docFile, 'utf-8')).toBe('# Notes\nSome content');

		// Only the init commit should exist
		const log = await git(worktreeDir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain('init');
	});

	it('multiple ticket operations produce no git commits (changes remain uncommitted)', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('RAP-1', 'Rapid Ops');
		store.saveTicketContext(ticket.folderName, 'todo', '# Todo\nDo the thing');

		// Verify final state has both files on disk
		const statusPath = path.join(worktreeDir, ticket.folderName, 'status.json');
		const docPath = path.join(worktreeDir, ticket.folderName, 'todo.md');
		expect(fs.existsSync(statusPath)).toBe(true);
		expect(fs.existsSync(docPath)).toBe(true);
		expect(fs.readFileSync(docPath, 'utf-8')).toBe('# Todo\nDo the thing');

		// No autoCommit: changes are uncommitted
		const status = await git(worktreeDir, 'status', '--porcelain');
		expect(status.trim()).not.toBe('');

		// Only the init commit should exist
		const log = await git(worktreeDir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines.length).toBe(1);
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

		// ../sibling is caught by requireSimpleName (path separator check)
		expect(() => store.updateTicket('../sibling', null, null, 'done')).toThrow(
			/simple name without path separators/
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

		// requireSimpleName rejects ../../outside (path separator check)
		expect(() => store.deleteTicket('../../outside')).toThrow(
			/simple name without path separators/
		);

		// Outside directory must be completely untouched
		expect(fs.existsSync(outsideDir)).toBe(true);
		expect(fs.readFileSync(path.join(outsideDir, 'data.txt'), 'utf-8')).toBe('must survive');
		const onDisk = JSON.parse(fs.readFileSync(path.join(outsideDir, 'status.json'), 'utf-8'));
		expect(onDisk.number).toBe('SECRET-1');
	});

	it('saveTicketContext with a folderName renamed away by updateTicket throws Ticket not found', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('STALE-1', 'Original Name');
		const oldFolder = ticket.folderName; // 'stale-1-original-name'

		// Rename the ticket by changing its title, which changes the folder name
		store.updateTicket(oldFolder, null, 'Renamed', null);

		// Old folder no longer exists; saving to it should throw
		expect(() => store.saveTicketContext(oldFolder, 'todo', '# stale write')).toThrow(
			/Ticket not found/
		);

		// Verify no context file was written at the old path
		expect(fs.existsSync(path.join(worktreeDir, oldFolder, 'todo.md'))).toBe(false);
	});

	it('saveTicketContext to a recycled folderName writes to the wrong ticket (data corruption)', async () => {
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

		// A stale reference saves context using the original folderName.
		// This silently writes into ticket B's folder -- data corruption.
		store.saveTicketContext(originalFolder, 'todo', '# This was meant for ticket A');

		// The context file lands in ticket B's directory, not ticket A's
		const docInB = path.join(worktreeDir, ticketB.folderName, 'todo.md');
		expect(fs.existsSync(docInB)).toBe(true);
		expect(fs.readFileSync(docInB, 'utf-8')).toBe('# This was meant for ticket A');

		// Ticket A (now at rec-99-reusable-name) has no context file -- the write went to the wrong ticket
		const renamedFolder = 'rec-99-reusable-name';
		const docInA = path.join(worktreeDir, renamedFolder, 'todo.md');
		expect(fs.existsSync(docInA)).toBe(false);
	});

	it('getTicketContext with a folderName that no longer exists returns null silently', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('GONE-1', 'Will Vanish');
		const oldFolder = ticket.folderName; // 'gone-1-will-vanish'

		// Write context content while the ticket exists
		store.saveTicketContext(oldFolder, 'todo', '# Important notes');
		expect(store.getTicketContext(oldFolder, 'todo')).toBe('# Important notes');

		// Rename the ticket so the old folder disappears
		store.updateTicket(oldFolder, null, 'Vanished', null);
		expect(fs.existsSync(path.join(worktreeDir, oldFolder))).toBe(false);

		// getTicketContext with the stale folderName returns null instead of
		// throwing an error -- the caller has no way to distinguish "context was
		// never written" from "ticket was renamed and content lives elsewhere"
		const result = store.getTicketContext(oldFolder, 'todo');
		expect(result).toBeNull();

		// Meanwhile the content still exists at the new path
		const newFolder = 'gone-1-vanished';
		expect(store.getTicketContext(newFolder, 'todo')).toBe('# Important notes');
	});

	it('saveTicketContext with undefined content throws TypeError from fs.writeFileSync', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('UNDEF-1', 'Undefined Test');

		// Bypass TypeScript to simulate a runtime caller passing undefined.
		// Node's fs.writeFileSync rejects undefined with a TypeError, so the
		// call does throw -- but with a low-level Node error rather than a
		// clear application-level message like "content must be a string".
		expect(() =>
			store.saveTicketContext('undef-1-undefined-test', 'notes', undefined as any)
		).toThrow(TypeError);
	});

	it('saveTicketContext with null content throws TypeError from fs.writeFileSync', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('NULL-1', 'Null Test');

		// Bypass TypeScript to simulate a runtime caller passing null.
		// Node's fs.writeFileSync rejects null with a TypeError, so the
		// call does throw -- but with a low-level Node error rather than a
		// clear application-level message like "content must be a string".
		expect(() =>
			store.saveTicketContext('null-1-null-test', 'notes', null as any)
		).toThrow(TypeError);
	});

	it('saveTicketContext with numeric content rejects non-string input', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('NUM-1', 'Numeric Test');

		// Bypass TypeScript to simulate a runtime caller passing a number.
		// Without an explicit guard, fs.writeFileSync silently coerces numbers
		// to strings, writing "123" to the file -- data corruption.
		expect(() =>
			store.saveTicketContext('num-1-numeric-test', 'notes', 123 as any)
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

	it('saveTicketContext on a nonexistent worktreeDir throws about the missing directory', () => {
		const base = tmpDir('nonexistent-save-');
		dirs.push(base);
		const missing = path.join(base, 'does-not-exist');

		const store = new TicketStore(missing);

		// When worktreeDir itself does not exist, requireContained calls
		// realpathSync on the missing parent, which throws a raw ENOENT.
		// The error should mention the worktree directory, not "Ticket not found".
		expect(() => store.saveTicketContext('some-folder', 'todo', 'content')).toThrow(
			/Worktree directory does not exist/
		);
	});

	it('getTicketContext on a nonexistent worktreeDir throws about the missing directory', () => {
		const base = tmpDir('nonexistent-get-');
		dirs.push(base);
		const missing = path.join(base, 'does-not-exist');

		const store = new TicketStore(missing);

		// When worktreeDir does not exist, requireContainedIn detects the
		// missing parent and throws a clear error. This is consistent with
		// saveTicketContext but inconsistent with listTickets (which returns []).
		expect(() => store.getTicketContext('some-folder', 'todo')).toThrow(
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

	it('rename where old dir contains context files: .md files survive at the new path', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('MD-5', 'Has Stages');
		const oldFolder = ticket.folderName; // 'md-5-has-stages'

		// Add multiple context files
		store.saveTicketContext(oldFolder, 'to-do', '# To Do\n- item 1\n- item 2');
		store.saveTicketContext(oldFolder, 'product-requirement-document', '# PRD\nRequirements here');
		store.saveTicketContext(oldFolder, 'design', '# Design\nArchitecture notes');

		// Rename the ticket by changing its title
		const updated = store.updateTicket(oldFolder, null, 'Renamed Stages', null);
		const newFolder = updated.folderName; // 'md-5-renamed-stages'

		expect(newFolder).toBe('md-5-renamed-stages');
		expect(fs.existsSync(path.join(worktreeDir, oldFolder))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, newFolder))).toBe(true);

		// Verify all .md files exist at the new path with correct content
		expect(store.getTicketContext(newFolder, 'to-do')).toBe('# To Do\n- item 1\n- item 2');
		expect(store.getTicketContext(newFolder, 'product-requirement-document')).toBe('# PRD\nRequirements here');
		expect(store.getTicketContext(newFolder, 'design')).toBe('# Design\nArchitecture notes');

		// Verify readTicket (via listTickets) still returns the names
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].folderName).toBe(newFolder);
		expect(tickets[0].contextNames).toContain('to-do');
		expect(tickets[0].contextNames).toContain('product-requirement-document');
		expect(tickets[0].contextNames).toContain('design');
		expect(tickets[0].contextNames.length).toBe(3);
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

	it('archiveTicket moves folder into archive subdirectory', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ARC-1', 'To Archive');

		expect(fs.existsSync(path.join(worktreeDir, 'arc-1-to-archive'))).toBe(true);

		store.archiveTicket('arc-1-to-archive');

		expect(fs.existsSync(path.join(worktreeDir, 'arc-1-to-archive'))).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'archive', 'arc-1-to-archive'))).toBe(true);
	});

	it('listTickets excludes tickets in the archive folder', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('KEEP-1', 'Visible');
		store.createTicket('ARC-2', 'Will Archive');
		store.archiveTicket('arc-2-will-archive');

		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].number).toBe('KEEP-1');
	});

	it('writeStatusJson throws after successful rename:'
		+ ' error propagates, folder at new path with stale status.json', async () => {
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

	it('archiveTicket on nonexistent folder throws', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		expect(() => store.archiveTicket('no-such-folder')).toThrow(/Ticket not found/);
	});

	it('archiveTicket throws when archive destination already exists', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('DUP-A', 'First Archive');

		const archiveDir = path.join(worktreeDir, 'archive', 'dup-a-first-archive');
		fs.mkdirSync(archiveDir, { recursive: true });

		expect(() => store.archiveTicket('dup-a-first-archive')).toThrow(/Archive destination already exists/);
		expect(fs.existsSync(path.join(worktreeDir, 'dup-a-first-archive'))).toBe(true);
	});

	it('archiveTicket moves folder without committing', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('CMT-1', 'Commit Test');

		store.archiveTicket('cmt-1-commit-test');

		// Verify the archive happened on disk
		expect(fs.existsSync(path.join(worktreeDir, 'archive', 'cmt-1-commit-test'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'cmt-1-commit-test'))).toBe(false);

		// No autoCommit: changes remain uncommitted
		const status = await git(worktreeDir, 'status', '--porcelain');
		expect(status.trim()).not.toBe('');

		// Only the init commit
		const log = await git(worktreeDir, 'log', '--oneline');
		const lines = log.trim().split('\n');
		expect(lines.length).toBe(1);
	});

	it('archiveTicket preserves context files', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('STG-1', 'With Stages');
		store.saveTicketContext('stg-1-with-stages', 'todo', '# Todo items');
		store.saveTicketContext('stg-1-with-stages', 'design', '# Design notes');

		store.archiveTicket('stg-1-with-stages');

		const archiveDir = path.join(worktreeDir, 'archive', 'stg-1-with-stages');
		expect(fs.existsSync(path.join(archiveDir, 'status.json'))).toBe(true);
		expect(fs.readFileSync(path.join(archiveDir, 'todo.md'), 'utf-8')).toBe('# Todo items');
		expect(fs.readFileSync(path.join(archiveDir, 'design.md'), 'utf-8')).toBe('# Design notes');
	});

	it('archiveTicket called twice throws on second call', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('DUB-1', 'Double Archive');

		store.archiveTicket('dub-1-double-archive');
		expect(() => store.archiveTicket('dub-1-double-archive')).toThrow(/Ticket not found/);
	});

	it('deleteTicket on already-archived ticket throws', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('DEL-A', 'Archived Then Delete');

		store.archiveTicket('del-a-archived-then-delete');
		expect(() => store.deleteTicket('del-a-archived-then-delete')).toThrow(/Ticket not found/);
	});

	it('ticket with folderName exactly "archive" is hidden by listTickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const archiveAsTicket = path.join(worktreeDir, 'archive');
		fs.mkdirSync(archiveAsTicket, { recursive: true });
		fs.writeFileSync(path.join(archiveAsTicket, 'status.json'), JSON.stringify({
			number: 'HIDE-1', title: 'Hidden', status: 'todo', useWorktree: false
		}));

		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		expect(tickets.length).toBe(0);
	});

	it('setUseWorktree(true) then updateTicket with status-only change -- useWorktree survives', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('WT-10', 'Survive Status');
		const folderName = 'wt-10-survive-status';

		store.setUseWorktree(folderName, true);

		let raw = JSON.parse(fs.readFileSync(path.join(worktreeDir, folderName, 'status.json'), 'utf-8'));
		expect(raw.useWorktree).toBe(true);

		const updated = store.updateTicket(folderName, null, null, 'in-progress');
		expect(updated.status).toBe('in-progress');
		expect(updated.folderName).toBe(folderName);
		expect(updated.useWorktree).toBe(true);

		raw = JSON.parse(fs.readFileSync(path.join(worktreeDir, folderName, 'status.json'), 'utf-8'));
		expect(raw.useWorktree).toBe(true);

		const tickets = store.listTickets();
		expect(tickets[0].useWorktree).toBe(true);
	});

	it('createTicket writes createdAt to status.json', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const before = new Date().toISOString();
		const store = new TicketStore(worktreeDir);
		store.createTicket('TS-1', 'Timestamp Test');
		const after = new Date().toISOString();

		const raw = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, 'ts-1-timestamp-test', 'status.json'), 'utf-8')
		);
		expect(raw.createdAt).toBeDefined();
		expect(raw.createdAt >= before).toBe(true);
		expect(raw.createdAt <= after).toBe(true);
	});

	it('updateTicket preserves createdAt', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('PR-1', 'Preserve CreatedAt');

		const rawBefore = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, 'pr-1-preserve-createdat', 'status.json'), 'utf-8')
		);
		const originalCreatedAt = rawBefore.createdAt;

		store.updateTicket('pr-1-preserve-createdat', null, null, 'in-progress');

		const rawAfter = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, 'pr-1-preserve-createdat', 'status.json'), 'utf-8')
		);
		expect(rawAfter.createdAt).toBe(originalCreatedAt);
	});

	it('listAllTicketNumbers returns active tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('LN-1', 'First');
		store.createTicket('LN-2', 'Second');

		const numbers = store.listAllTicketNumbers();
		expect(numbers.length).toBe(2);
		const nums = numbers.map((n) => n.number).sort();
		expect(nums).toEqual(['LN-1', 'LN-2']);
		expect(numbers[0].createdAt).toBeDefined();
	});

	it('listAllTicketNumbers includes archived tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('AR-1', 'Active');
		store.createTicket('AR-2', 'To Archive');
		store.archiveTicket('ar-2-to-archive');

		const numbers = store.listAllTicketNumbers();
		expect(numbers.length).toBe(2);
		const nums = numbers.map((n) => n.number).sort();
		expect(nums).toEqual(['AR-1', 'AR-2']);
	});

	it('listAllTicketNumbers with empty archive', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('EA-1', 'Only Active');

		// Create empty archive directory
		fs.mkdirSync(path.join(worktreeDir, 'archive'), { recursive: true });

		const numbers = store.listAllTicketNumbers();
		expect(numbers.length).toBe(1);
		expect(numbers[0].number).toBe('EA-1');
	});

	it('listAllTicketNumbers with no tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		const numbers = store.listAllTicketNumbers();
		expect(numbers.length).toBe(0);
	});

	it('suggestNextNumber returns null with no tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		expect(store.suggestNextNumber()).toBeNull();
	});

	it('suggestNextNumber returns next number for one ticket', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0001', 'First');

		expect(store.suggestNextNumber()).toBe('ST-0002');
	});

	it('suggestNextNumber considers archived tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0001', 'First');
		store.createTicket('ST-0005', 'Fifth');
		store.archiveTicket('st-0005-fifth');

		// Even though ST-0005 is archived, next should be ST-0006
		expect(store.suggestNextNumber()).toBe('ST-0006');
	});

	it('suggestNextNumber uses highest across active and archived', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0003', 'Three');
		store.createTicket('ST-0010', 'Ten');
		store.archiveTicket('st-0010-ten');
		store.createTicket('ST-0007', 'Seven');

		// Highest is ST-0010 (archived), so next is ST-0011
		expect(store.suggestNextNumber()).toBe('ST-0011');
	});

	it('suggestNextNumber with prefix returns next number for that prefix', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0001', 'First');
		store.createTicket('ST-0005', 'Fifth');
		store.createTicket('BUG-0001', 'Bug One');

		expect(store.suggestNextNumber('ST')).toBe('ST-0006');
	});

	it('suggestNextNumber with unknown prefix returns PREFIX-0001', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0001', 'First');

		expect(store.suggestNextNumber('FEAT')).toBe('FEAT-0001');
	});

	it('suggestNextNumber with prefix considers archived tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('BUG-0001', 'Bug One');
		store.createTicket('BUG-0005', 'Bug Five');
		store.archiveTicket('bug-0005-bug-five');

		expect(store.suggestNextNumber('BUG')).toBe('BUG-0006');
	});

	it('suggestNextNumber handles pre-existing tickets without createdAt', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		// Simulate a pre-existing ticket that predates the createdAt field
		const oldDir = path.join(worktreeDir, 'st-0003-old-ticket');
		fs.mkdirSync(oldDir, { recursive: true });
		fs.writeFileSync(
			path.join(oldDir, 'status.json'),
			JSON.stringify({ number: 'ST-0003', title: 'Old Ticket', status: 'todo', useWorktree: false })
		);
		gitSync(worktreeDir, 'add', '-A');
		gitSync(worktreeDir, 'commit', '-m', 'old ticket');

		// Create a new ticket with createdAt via the normal API
		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0001', 'New Ticket');

		// The old ticket (ST-0003) has no createdAt, treated as oldest.
		// The new ticket (ST-0001) is most recent, so prefix is ST.
		// Highest num with prefix ST is 3 (from old ticket).
		expect(store.suggestNextNumber()).toBe('ST-0004');
	});

	it('listAllTicketNumbers returns entries without createdAt for old tickets', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		// Simulate a pre-existing ticket without createdAt
		const oldDir = path.join(worktreeDir, 'old-1-legacy');
		fs.mkdirSync(oldDir, { recursive: true });
		fs.writeFileSync(
			path.join(oldDir, 'status.json'),
			JSON.stringify({ number: 'OLD-1', title: 'Legacy', status: 'todo', useWorktree: false })
		);
		gitSync(worktreeDir, 'add', '-A');
		gitSync(worktreeDir, 'commit', '-m', 'legacy ticket');

		const store = new TicketStore(worktreeDir);
		const numbers = store.listAllTicketNumbers();
		expect(numbers.length).toBe(1);
		expect(numbers[0].number).toBe('OLD-1');
		expect(numbers[0].createdAt).toBeUndefined();
	});

	it('T3: suggestNextNumber does not crash when status.json has numeric "number" field', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('ST-0001', 'Normal Ticket');

		// Manually create a folder with a status.json where "number" is numeric (not a string)
		const badDir = path.join(worktreeDir, 'bad-0002-numeric');
		fs.mkdirSync(badDir, { recursive: true });
		fs.writeFileSync(
			path.join(badDir, 'status.json'),
			JSON.stringify({ number: 42, title: 'bad', status: 'to-do', useWorktree: false })
		);
		gitSync(worktreeDir, 'add', '-A');
		gitSync(worktreeDir, 'commit', '-m', 'add bad ticket');

		// suggestNextNumber should not crash -- it should skip the bad entry and return ST-0002
		expect(store.suggestNextNumber()).toBe('ST-0002');
	});

	it('copying a file writes it to the ticket folder and the file can be read back', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('FILE-1', 'File Test');

		const content = Buffer.from('hello world');
		store.copyFileToTicket('file-1-file-test', 'notes.txt', content);

		const readBack = store.getFileContent('file-1-file-test', 'notes.txt');
		expect(readBack.toString()).toBe('hello world');

		const files = store.listTicketFiles('file-1-file-test');
		expect(files).toContain('notes.txt');
	});

	it('adding a reference persists it in status.json and removing it clears it', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('REF-1', 'Reference Test');

		const refPath = path.join(worktreeDir, 'some-external-file.txt');
		fs.writeFileSync(refPath, 'external content');

		store.addReference('ref-1-reference-test', refPath);

		const statusRaw = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, 'ref-1-reference-test', 'status.json'), 'utf-8')
		);
		expect(statusRaw.references).toEqual([{ path: refPath }]);

		store.removeReference('ref-1-reference-test', refPath);

		const statusAfter = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, 'ref-1-reference-test', 'status.json'), 'utf-8')
		);
		expect(statusAfter.references).toEqual([]);
	});

	it('copyFileToTicket rejects status.json as filename', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('PROT-1', 'Protected Test');

		expect(() => store.copyFileToTicket('prot-1-protected-test', 'status.json', Buffer.from('evil'))).toThrow(
			/Cannot overwrite status\.json/
		);
	});

	it('H1: getReferencedFileContent rejects paths not in the ticket references array', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const externalDir = tmpDir('ref-content-outside-');
		dirs.push(externalDir);
		const externalFile = path.join(externalDir, 'secret.txt');
		fs.writeFileSync(externalFile, 'SENSITIVE DATA');

		const store = new TicketStore(worktreeDir);
		store.createTicket('SEC-1', 'Security Test');

		expect(() => store.getReferencedFileContent('sec-1-security-test', externalFile)).toThrow(
			/not a registered reference/
		);

		store.addReference('sec-1-security-test', externalFile);

		const content = store.getReferencedFileContent('sec-1-security-test', externalFile);
		expect(content.toString()).toBe('SENSITIVE DATA');
	});

	it('H6.1: addReference with duplicate path does not produce a spurious write or commit', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('DUP-R1', 'Dup Ref Test');
		const folderName = 'dup-r1-dup-ref-test';

		const refPath = path.join(worktreeDir, 'external.txt');
		fs.writeFileSync(refPath, 'content');

		store.addReference(folderName, refPath);

		const logBefore = await git(worktreeDir, 'log', '--oneline');
		const commitCountBefore = logBefore.trim().split('\n').length;
		const statusJsonPath = path.join(worktreeDir, folderName, 'status.json');
		const mtimeBefore = fs.statSync(statusJsonPath).mtimeMs;

		await new Promise((resolve) => setTimeout(resolve, 50));

		store.addReference(folderName, refPath);

		const logAfter = await git(worktreeDir, 'log', '--oneline');
		const commitCountAfter = logAfter.trim().split('\n').length;
		const mtimeAfter = fs.statSync(statusJsonPath).mtimeMs;

		expect(commitCountAfter).toBe(commitCountBefore);
		expect(mtimeAfter).toBe(mtimeBefore);
	});

	it('H2: setUseWorktree(true) then updateTicket with title rename'
		+ ' -- useWorktree survives after folder rename', async () => {
		const worktreeDir = await createGitWorktree();
		dirs.push(worktreeDir);

		const store = new TicketStore(worktreeDir);
		store.createTicket('WT-11', 'Old Name');
		const folderName = 'wt-11-old-name';

		store.setUseWorktree(folderName, true);

		let raw = JSON.parse(fs.readFileSync(path.join(worktreeDir, folderName, 'status.json'), 'utf-8'));
		expect(raw.useWorktree).toBe(true);

		const updated = store.updateTicket(folderName, null, 'New Name', null);
		expect(updated.title).toBe('New Name');
		expect(updated.folderName).toBe('wt-11-new-name');
		expect(fs.existsSync(path.join(worktreeDir, folderName))).toBe(false);
		expect(updated.useWorktree).toBe(true);

		raw = JSON.parse(fs.readFileSync(path.join(worktreeDir, 'wt-11-new-name', 'status.json'), 'utf-8'));
		expect(raw.useWorktree).toBe(true);

		const tickets = store.listTickets();
		expect(tickets[0].useWorktree).toBe(true);
	});

});
