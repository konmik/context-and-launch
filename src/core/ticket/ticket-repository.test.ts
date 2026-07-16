import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TicketRepository } from './ticket-repository.js';

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
});
