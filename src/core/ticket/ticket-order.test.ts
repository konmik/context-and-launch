import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TicketOrderStore } from './ticket-order.js';
import { TicketStore } from './ticket-store.js';
import { git } from '~/test-git.js';
import type { TicketInfo } from './ticket-store.js';

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

async function createGitWorktree(withGit = false): Promise<string> {
	const dir = tmpDir('ticket-order-test-');
	if (withGit) {
		await git(dir, 'init');
		await git(dir, 'commit', '--allow-empty', '-m', 'init');
	}
	return dir;
}

function ticket(folderName: string, status: string): TicketInfo {
	return {
		number: '', title: '', status, folderName,
		contextNames: [], useWorktree: false, hasAgentWorktree: false, fileNames: [], references: [],
	};
}

describe('TicketOrderStore', () => {
	const dirs: string[] = [];
	afterAll(() => { cleanup(...dirs); dirs.length = 0; });

	it.concurrent('read returns empty object when file is missing', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		expect(new TicketOrderStore(dir).read()).toEqual({});
	});

	it.concurrent('write persists to disk without committing', async () => {
		const dir = await createGitWorktree(true); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a', 'b'], done: ['c'] });
		expect(JSON.parse(fs.readFileSync(path.join(dir, 'ticket-order.json'), 'utf-8')))
			.toEqual({ todo: ['a', 'b'], done: ['c'] });
		// No autoCommit: changes remain uncommitted
		const status = await git(dir, 'status', '--porcelain');
		expect(status.trim()).not.toBe('');
	});

	it.concurrent('reconcile groups by status, preserves order, appends new, removes stale', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['c', 'a', 'deleted'] });

		const result = store.reconcile([
			ticket('a', 'todo'),
			ticket('c', 'todo'),
			ticket('new-one', 'todo'),
			ticket('d', 'done'),
		], ['todo', 'done']);

		expect(result['todo']).toEqual(['c', 'a', 'new-one']);
		expect(result['done']).toEqual(['d']);
	});

	it.concurrent('reconcile moves ticket when status disagrees with order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a'], done: [] });

		const result = store.reconcile([ticket('a', 'done')], ['todo', 'done']);
		expect(result['todo']).toEqual([]);
		expect(result['done']).toEqual(['a']);
	});

	it.concurrent('moveTicket within same column', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a', 'b', 'c'] });
		store.moveTicket('a', 'todo', 'todo', 2);
		expect(store.read()['todo']).toEqual(['b', 'c', 'a']);
	});

	it.concurrent('moveTicket between columns', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a', 'b'], done: ['c'] });
		store.moveTicket('a', 'todo', 'done', 0);
		const result = store.read();
		expect(result['todo']).toEqual(['b']);
		expect(result['done']).toEqual(['a', 'c']);
	});

	it.concurrent('round trip preserves configured empty columns and serialized order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a'], 'in-progress': [], done: [] });
		const before = fs.readFileSync(path.join(dir, 'ticket-order.json'), 'utf-8');

		store.moveTicket('a', 'todo', 'in-progress', 0);
		store.moveTicket('a', 'in-progress', 'todo', 0);

		expect(fs.readFileSync(path.join(dir, 'ticket-order.json'), 'utf-8')).toBe(before);
	});

	it.concurrent('appendTicket adds to end', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a'] });
		store.appendTicket('b', 'todo');
		expect(store.read()['todo']).toEqual(['a', 'b']);
	});

	it.concurrent('removeTicket removes from all columns', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['a', 'b'], done: ['a', 'c'] });
		store.removeTicket('a');
		expect(store.read()['todo']).toEqual(['b']);
		expect(store.read()['done']).toEqual(['c']);
	});

	it.concurrent('renameTicket updates folder name in place', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		store.write({ todo: ['old', 'b'] });
		store.renameTicket('old', 'new');
		expect(store.read()['todo']).toEqual(['new', 'b']);
	});

	it.concurrent('reconcile with empty columns and one ticket returns empty order without crashing', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketOrderStore(dir);
		const result = store.reconcile([ticket('a', 'todo')], []);
		expect(result).toEqual({});
	});
});

describe('TicketStore + TicketOrderStore integration', () => {
	const dirs: string[] = [];
	afterAll(() => { cleanup(...dirs); dirs.length = 0; });

	it.concurrent('createTicket appends to order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketStore(dir);
		store.createTicket('A-1', 'First', 'todo');
		store.createTicket('B-2', 'Second', 'done');
		const order = store.readOrderStore().read();
		expect(order['todo']).toEqual(['a-1-first']);
		expect(order['done']).toEqual(['b-2-second']);
	});

	it.concurrent('deleteTicket removes from order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketStore(dir);
		store.createTicket('A-1', 'First', 'todo');
		store.createTicket('B-2', 'Second', 'todo');
		store.deleteTicket('a-1-first');
		expect(store.readOrderStore().read()['todo']).toEqual(['b-2-second']);
	});

	it.concurrent('updateTicket with rename updates order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketStore(dir);
		store.createTicket('A-1', 'Old Title', 'todo');
		store.updateTicket('a-1-old-title', null, 'New Title', null);
		const order = store.readOrderStore().read();
		expect(order['todo']).toContain('a-1-new-title');
		expect(order['todo']).not.toContain('a-1-old-title');
	});
});

describe('TicketStore.moveTicket (deepened interface)', () => {
	const dirs: string[] = [];
	afterAll(() => { cleanup(...dirs); dirs.length = 0; });

	it.concurrent('cross-column move updates both status and order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketStore(dir);
		store.createTicket('X-1', 'Cross', 'todo');
		store.createTicket('Y-2', 'Stays', 'done');

		store.moveTicket('x-1-cross', 'todo', 'done', 0);

		const status = JSON.parse(fs.readFileSync(path.join(dir, 'x-1-cross', 'status.json'), 'utf-8'));
		expect(status.status).toBe('done');
		const order = store.readOrderStore().read();
		expect(order['todo'] ?? []).not.toContain('x-1-cross');
		expect(order['done']).toEqual(['x-1-cross', 'y-2-stays']);
	});

	it.concurrent('same-column reorder updates order without touching status', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketStore(dir);
		store.createTicket('A-1', 'Alpha', 'todo');
		store.createTicket('B-2', 'Bravo', 'todo');
		const statusBefore = fs.readFileSync(path.join(dir, 'a-1-alpha', 'status.json'), 'utf-8');

		store.moveTicket('a-1-alpha', 'todo', 'todo', 1);

		expect(store.readOrderStore().read()['todo']).toEqual(['b-2-bravo', 'a-1-alpha']);
		expect(fs.readFileSync(path.join(dir, 'a-1-alpha', 'status.json'), 'utf-8')).toBe(statusBefore);
	});

	it.concurrent('loadBoardSnapshot returns tickets and reconciled order', async () => {
		const dir = await createGitWorktree(); dirs.push(dir);
		const store = new TicketStore(dir);
		store.createTicket('L-1', 'First', 'todo');
		store.createTicket('L-2', 'Second', 'done');

		const { tickets, ticketOrder } = await store.loadBoardSnapshot(['todo', 'done']);
		expect(tickets.length).toBe(2);
		expect(ticketOrder['todo']).toEqual(['l-1-first']);
		expect(ticketOrder['done']).toEqual(['l-2-second']);
	});
});
