import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TicketStore } from './ticket-store.js';
import { TicketOrderStore } from './ticket-order.js';
import { git } from '~/test-git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
}

async function createWorktreeDir(): Promise<{ projectDir: string; worktreeDir: string }> {
	const projectDir = tmpDir('case-proj-');
	await git(projectDir, 'init');
	await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

	const worktreeDir = tmpDir('case-wt-');
	fs.rmSync(worktreeDir, { recursive: true });
	await git(projectDir, 'worktree', 'add', worktreeDir, '-b', 'case-test');

	return { projectDir, worktreeDir };
}

describe('case-sensitive column move', () => {
	const cleanups: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const fn of cleanups) {
			await fn();
		}
		cleanups.length = 0;
	});

	it('moveTicket with fromColumn="Todo" toColumn="todo" creates duplicate column keys in order file', async () => {
		const { projectDir, worktreeDir } = await createWorktreeDir();
		cleanups.push(async () => {
			try {
				await git(projectDir, 'worktree', 'remove', '--force', worktreeDir);
			} catch {
				// ignore
			}
			cleanup(projectDir, worktreeDir);
		});

		const store = new TicketStore(worktreeDir);

		// Create a ticket with status "Todo" (capitalized)
		const ticket = store.createTicket('CS-1', 'Case Test', 'Todo');

		// Verify status.json has "Todo"
		const statusBefore = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, ticket.folderName, 'status.json'), 'utf-8')
		);
		expect(statusBefore.status).toBe('Todo');

		// Read the order file to see the initial state
		const orderStore = store.readOrderStore();
		const orderBefore = orderStore.read();
		expect(orderBefore['Todo']).toContain(ticket.folderName);

		// Now move with case-different column names: "Todo" -> "todo"
		store.moveTicket(ticket.folderName, 'Todo', 'todo', 0);

		// Check status.json - should now be "todo"
		const statusAfter = JSON.parse(
			fs.readFileSync(path.join(worktreeDir, ticket.folderName, 'status.json'), 'utf-8')
		);
		expect(statusAfter.status).toBe('todo');

		// Check order file for consistency
		const orderAfter = orderStore.read();

		// The bug: "Todo" key still exists (now empty) and "todo" key was created
		// This means the order file has two keys that represent the same column
		// with different casing
		const todoKeys = Object.keys(orderAfter).filter(
			k => k.toLowerCase() === 'todo'
		);

		// If there are two keys (e.g. "Todo" and "todo"), that's a desync bug.
		// A well-behaved system should only have one canonical column key.
		expect(todoKeys.length).toBe(1);

		// The ticket should be in exactly one column
		let columnsContainingTicket = 0;
		for (const col of Object.keys(orderAfter)) {
			if (orderAfter[col].includes(ticket.folderName)) {
				columnsContainingTicket++;
			}
		}
		expect(columnsContainingTicket).toBe(1);
	});
});
