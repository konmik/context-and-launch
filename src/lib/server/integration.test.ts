import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectRegistry } from './project-registry.js';
import { BoardConfigManager, DEFAULT_COLUMNS } from './board-config.js';
import { WorktreeManager } from './worktree-manager.js';
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

async function createTestProjectContext() {
	const configDir = tmpDir('int-config-');
	const boardConfigDir = tmpDir('int-board-config-');
	const projectDir = tmpDir('int-project-');

	await git(projectDir, 'init');
	await git(projectDir, 'commit', '--allow-empty', '-m', 'init');

	const registry = new ProjectRegistry(configDir);
	registry.addProject(projectDir, 'test-proj');

	const worktreeManager = new WorktreeManager(boardConfigDir);
	const boardConfigManager = new BoardConfigManager(boardConfigDir);

	const worktreeDir = await worktreeManager.ensureWorktree(projectDir, 'test-proj');

	return {
		configDir,
		boardConfigDir,
		projectDir,
		registry,
		worktreeManager,
		boardConfigManager,
		worktreeDir,
		cleanup: async () => {
			try {
				const wtPath = worktreeManager.getWorktreeDir('test-proj');
				if (fs.existsSync(wtPath)) {
					await git(projectDir, 'worktree', 'remove', '--force', wtPath);
				}
			} catch {
				// ignore
			}
			cleanup(configDir, boardConfigDir, projectDir);
		}
	};
}

describe('Integration', () => {
	const cleanups: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const fn of cleanups) {
			await fn();
		}
		cleanups.length = 0;
	});

	it('board returns columns and empty ticket list', async () => {
		const ctx = await createTestProjectContext();
		cleanups.push(ctx.cleanup);

		const config = ctx.boardConfigManager.getConfig();
		const tickets = new TicketStore(ctx.worktreeDir).listTickets();

		expect(config.columns).toEqual(DEFAULT_COLUMNS);
		expect(tickets).toEqual([]);
	});

	it('create ticket then list shows it in first column', async () => {
		const ctx = await createTestProjectContext();
		cleanups.push(ctx.cleanup);

		const firstColumn = ctx.boardConfigManager.getConfig().columns[0];
		const store = new TicketStore(ctx.worktreeDir);
		const ticket = store.createTicket('T-1', 'Test Ticket', firstColumn);

		expect(ticket.number).toBe('T-1');
		expect(ticket.status).toBe('todo');

		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].number).toBe('T-1');
	});

	it('update ticket status moves it', async () => {
		const ctx = await createTestProjectContext();
		cleanups.push(ctx.cleanup);

		const store = new TicketStore(ctx.worktreeDir);
		const firstColumn = ctx.boardConfigManager.getConfig().columns[0];
		const ticket = store.createTicket('M-1', 'Move Me', firstColumn);

		const updated = store.updateTicket(ticket.folderName, null, null, 'in-progress');
		expect(updated.status).toBe('in-progress');
	});

	it('delete ticket removes it', async () => {
		const ctx = await createTestProjectContext();
		cleanups.push(ctx.cleanup);

		const store = new TicketStore(ctx.worktreeDir);
		const firstColumn = ctx.boardConfigManager.getConfig().columns[0];
		const ticket = store.createTicket('D-1', 'Delete Me', firstColumn);

		store.deleteTicket(ticket.folderName);
		const tickets = store.listTickets();
		expect(tickets).toEqual([]);
	});

	it('stage markdown roundtrip', async () => {
		const ctx = await createTestProjectContext();
		cleanups.push(ctx.cleanup);

		const store = new TicketStore(ctx.worktreeDir);
		const firstColumn = ctx.boardConfigManager.getConfig().columns[0];
		const ticket = store.createTicket('S-1', 'Stage Test', firstColumn);

		// Not found initially
		const missing = store.getStageMarkdown(ticket.folderName, 'todo');
		expect(missing).toBeNull();

		// Save and read back
		store.saveStageMarkdown(ticket.folderName, 'todo', '# Notes\nSome content');
		const content = store.getStageMarkdown(ticket.folderName, 'todo');
		expect(content).toBe('# Notes\nSome content');
	});

	it('path traversal in stage name returns error', async () => {
		const ctx = await createTestProjectContext();
		cleanups.push(ctx.cleanup);

		const store = new TicketStore(ctx.worktreeDir);
		const firstColumn = ctx.boardConfigManager.getConfig().columns[0];
		const ticket = store.createTicket('T-2', 'Traversal Test', firstColumn);

		// Traversal in stage
		expect(() => store.getStageMarkdown(ticket.folderName, '..')).toThrow();

		// Traversal in folderName
		expect(() => store.getStageMarkdown('..', 'todo')).toThrow();

		// Slash in stage
		expect(() => store.getStageMarkdown(ticket.folderName, '../todo')).toThrow();
	});

	it('project not found throws', async () => {
		const configDir = tmpDir('int-config-');
		cleanup(configDir);

		const registry = new ProjectRegistry(configDir);
		const projects = registry.listProjects();
		const found = projects.find((p) => p.slug === 'nonexistent');
		expect(found).toBeUndefined();

		cleanup(configDir);
	});
});
