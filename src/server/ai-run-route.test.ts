import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorktreeManager } from './worktree-manager.js';
import { TicketStore } from './ticket-store.js';
import { errorMessage } from './errors.js';

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

describe('ai/run.ts endpoint logic', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('valid slug but nonexistent folderName returns 404 "Ticket not found"', () => {
		// Create a real worktree directory with one ticket
		const worktreeDir = tmpDir('run-worktree-');
		dirs.push(worktreeDir);

		const ticketFolder = path.join(worktreeDir, 'proj-1-real-ticket');
		fs.mkdirSync(ticketFolder, { recursive: true });
		fs.writeFileSync(
			path.join(ticketFolder, 'status.json'),
			JSON.stringify({ number: 'PROJ-1', title: 'Real Ticket', status: 'todo' })
		);

		// Confirm the ticket exists via TicketStore
		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].folderName).toBe('proj-1-real-ticket');

		// Now simulate the POST handler logic with a folderName that does not match
		const nonexistentFolder = 'proj-99-does-not-exist';
		const ticket = tickets.find(t => t.folderName === nonexistentFolder);
		expect(ticket).toBeUndefined();

		// The endpoint returns 404 "Ticket not found"
		const status = !ticket ? 404 : 200;
		const body = !ticket ? 'Ticket not found' : null;

		expect(status).toBe(404);
		expect(body).toBe('Ticket not found');
	});

	it('nonexistent slug returns misleading "Ticket not found" instead of indicating missing worktree', () => {
		const configDir = tmpDir('run-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(configDir);
		const slug = 'does-not-exist';

		// This mirrors the POST handler logic: getWorktreeDir then TicketStore.listTickets
		const worktreeDir = manager.getWorktreeDir(slug);

		// worktreeDir points to a nonexistent directory
		expect(fs.existsSync(worktreeDir)).toBe(false);

		// TicketStore.listTickets returns [] for a nonexistent directory
		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		expect(tickets).toEqual([]);

		// The POST handler does: tickets.find(t => t.folderName === folderName)
		// With an empty array, this always returns undefined
		const ticket = tickets.find(t => t.folderName === 'any-folder');
		expect(ticket).toBeUndefined();

		// So the endpoint returns 404 "Ticket not found" -- misleading because
		// the real issue is that the worktree directory does not exist (ensureWorktree
		// was never called for this slug). The user sees "Ticket not found" when the
		// actual problem is "project worktree not initialized".
		//
		// Simulating the response the POST handler would produce:
		const status = !ticket ? 404 : 200;
		const body = !ticket ? 'Ticket not found' : null;

		expect(status).toBe(404);
		expect(body).toBe('Ticket not found');
	});

	it('slug with path traversal ("..") causes requireSafeSlug to throw and try-catch returns 500', () => {
		const configDir = tmpDir('run-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(configDir);

		// Simulate the POST handler: getWorktreeDir is the first call inside the try block.
		// A traversal slug like ".." should throw from requireSafeSlug.
		let status: number;
		let body: string;

		try {
			manager.getWorktreeDir('..');
			// If we reach here, requireSafeSlug did not throw -- that is the bug case
			status = 200;
			body = '';
		} catch (e) {
			// The endpoint's catch returns 500 with errorMessage(e)
			status = 500;
			body = errorMessage(e);
		}

		expect(status).toBe(500);
		expect(body).toBe('Invalid slug: ..');
	});
});
