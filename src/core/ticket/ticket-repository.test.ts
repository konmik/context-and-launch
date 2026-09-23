import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TicketRepository } from './ticket-repository.js';
import { TicketStore } from './ticket-store.js';

describe('TicketRepository', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects malformed Dependency and Group fields at the status.json boundary', () => {
		const ticketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-repository-'));
		dirs.push(ticketDir);
		fs.writeFileSync(path.join(ticketDir, 'status.json'), JSON.stringify({
			number: 'A-1',
			title: 'Alpha',
			status: 'todo',
			useWorktree: false,
			dependsOn: 'B-1',
			memberOf: 42,
		}));

		expect(new TicketRepository().readStatusJson(ticketDir)).toBeNull();
	});

	it('can update a ticket while board status reads are in flight', async () => {
		const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-repository-'));
		dirs.push(worktreeDir);
		const store = new TicketStore(worktreeDir);
		const ticket = store.createTicket('A-1', 'Alpha');
		const reads = Array.from({ length: 32 }, () => store.loadBoardSnapshot(['todo', 'backlog']));
		try {
			await fs.promises.readdir(worktreeDir);
			await fs.promises.stat(path.join(worktreeDir, ticket.folderName, 'status.json'));
			store.updateTicket(ticket.folderName, null, null, 'backlog');
			expect(store.getTicket(ticket.folderName)?.status).toBe('backlog');
		} finally {
			await Promise.all(reads);
		}
		expect((await store.loadBoardSnapshot(['todo', 'backlog'])).tickets[0].status).toBe('backlog');
	});

	it('surfaces unreadable status files during board loading', async () => {
		const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-repository-'));
		dirs.push(worktreeDir);
		fs.mkdirSync(path.join(worktreeDir, 'a-1-alpha', 'status.json'), { recursive: true });
		await expect(new TicketStore(worktreeDir).loadBoardSnapshot(['todo'])).rejects.toThrow();
	});
});
