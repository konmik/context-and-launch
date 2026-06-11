import { describe, it, expect } from 'vitest';
import { reconcileOrder } from './ticket-order-reconcile.js';
import type { TicketInfo } from './ticket-store.js';

function ticket(folderName: string, status: string): TicketInfo {
	return {
		number: '', title: '', status, folderName,
		contextNames: [], useWorktree: false, fileNames: [], references: [],
	};
}

describe('reconcileOrder', () => {
	it('groups tickets by status, preserves existing order, appends new', () => {
		const existing = { todo: ['c', 'a', 'deleted'] };
		const tickets = [
			ticket('a', 'todo'),
			ticket('c', 'todo'),
			ticket('new-one', 'todo'),
			ticket('d', 'done'),
		];
		const { order, changed } = reconcileOrder(existing, tickets, ['todo', 'done']);
		expect(order['todo']).toEqual(['c', 'a', 'new-one']);
		expect(order['done']).toEqual(['d']);
		expect(changed).toBe(true);
	});

	it('returns changed=false when nothing changes', () => {
		const existing = { todo: ['a'], done: ['b'] };
		const tickets = [ticket('a', 'todo'), ticket('b', 'done')];
		const { order, changed } = reconcileOrder(existing, tickets, ['todo', 'done']);
		expect(order).toEqual(existing);
		expect(changed).toBe(false);
	});

	it('returns empty order for empty columns', () => {
		const { order } = reconcileOrder({}, [ticket('a', 'todo')], []);
		expect(order).toEqual({});
	});
});
