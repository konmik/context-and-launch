import type { TicketInfo } from './ticket-store.js';
import type { TicketOrder } from './ticket-order.js';

export function reconcileOrder(
	existing: TicketOrder,
	tickets: TicketInfo[],
	columns: string[],
): { order: TicketOrder; changed: boolean } {
	if (columns.length === 0) return { order: {}, changed: JSON.stringify(existing) !== '{}' };

	const ticketsByColumn = new Map<string, string[]>();
	for (const col of columns) {
		ticketsByColumn.set(col, []);
	}

	for (const t of tickets) {
		const col = columns.includes(t.status) ? t.status : columns[0];
		ticketsByColumn.get(col)!.push(t.folderName);
	}

	const result: TicketOrder = {};
	for (const col of columns) {
		const actualFolders = new Set(ticketsByColumn.get(col) ?? []);
		const existingOrder = existing[col] ?? [];

		const ordered: string[] = [];
		for (const fn of existingOrder) {
			if (actualFolders.has(fn)) {
				ordered.push(fn);
				actualFolders.delete(fn);
			}
		}
		for (const fn of actualFolders) {
			ordered.push(fn);
		}
		result[col] = ordered;
	}

	const changed = JSON.stringify(result) !== JSON.stringify(existing);
	return { order: result, changed };
}
