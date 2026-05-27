import fs from 'fs';
import path from 'path';
import type { TicketInfo } from './ticket-store.js';

export type TicketOrder = Record<string, string[]>;

export class TicketOrderStore {
	private worktreeDir: string;
	private filePath: string;

	constructor(worktreeDir: string) {
		this.worktreeDir = worktreeDir;
		this.filePath = path.join(worktreeDir, 'ticket-order.json');
	}

	read(): TicketOrder {
		try {
			if (!fs.existsSync(this.filePath)) return {};
			const raw = fs.readFileSync(this.filePath, 'utf-8');
			const parsed = JSON.parse(raw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
			for (const key of Object.keys(parsed)) {
				if (!Array.isArray(parsed[key])) return {};
			}
			return parsed as TicketOrder;
		} catch (err) {
			console.warn(`Failed to read ticket order from ${this.filePath}:`, err);
			return {};
		}
	}

	write(order: TicketOrder): void {
		fs.writeFileSync(this.filePath, JSON.stringify(order, null, 2));
	}

	reconcile(tickets: TicketInfo[], columns: string[]): TicketOrder {
		if (columns.length === 0) return {};

		const existing = this.read();
		const ticketsByColumn = new Map<string, string[]>();
		for (const col of columns) {
			ticketsByColumn.set(col, []);
		}

		// Group tickets by their status column
		for (const t of tickets) {
			const col = columns.includes(t.status) ? t.status : columns[0];
			ticketsByColumn.get(col)!.push(t.folderName);
		}

		const result: TicketOrder = {};
		for (const col of columns) {
			const actualFolders = new Set(ticketsByColumn.get(col) ?? []);
			const existingOrder = existing[col] ?? [];

			// Keep existing order for folders still in this column, remove stale
			const ordered: string[] = [];
			for (const fn of existingOrder) {
				if (actualFolders.has(fn)) {
					ordered.push(fn);
					actualFolders.delete(fn);
				}
			}
			// Append any new folders not in existing order
			for (const fn of actualFolders) {
				ordered.push(fn);
			}
			result[col] = ordered;
		}

		// Only write if the order actually changed to avoid
		// unnecessary git commits and file-watcher triggers on every page load
		const changed = JSON.stringify(result) !== JSON.stringify(existing);
		if (changed) {
			this.write(result);
		}
		return result;
	}

	moveTicket(folderName: string, fromColumn: string, toColumn: string, newIndex: number): void {
		const order = this.read();

		if (order[fromColumn]) {
			order[fromColumn] = order[fromColumn].filter(fn => fn !== folderName);
			if (order[fromColumn].length === 0 && fromColumn !== toColumn) {
				delete order[fromColumn];
			}
		}

		if (!order[toColumn]) {
			order[toColumn] = [];
		}

		// Deduplicate: the ticket may already be listed in the target column
		// if the order file drifted out of sync with the actual ticket status
		order[toColumn] = order[toColumn].filter(fn => fn !== folderName);

		const idx = Math.max(0, Math.min(newIndex, order[toColumn].length));
		order[toColumn].splice(idx, 0, folderName);

		this.write(order);
	}

	appendTicket(folderName: string, column: string): void {
		const order = this.read();
		if (!order[column]) {
			order[column] = [];
		}
		if (!order[column].includes(folderName)) {
			order[column].push(folderName);
		}
		this.write(order);
	}

	removeTicket(folderName: string): void {
		const order = this.read();
		let changed = false;
		for (const col of Object.keys(order)) {
			const before = order[col].length;
			order[col] = order[col].filter(fn => fn !== folderName);
			if (order[col].length !== before) changed = true;
		}
		if (changed) {
			this.write(order);
		}
	}

	renameTicket(oldFolderName: string, newFolderName: string): void {
		const order = this.read();
		let changed = false;
		for (const col of Object.keys(order)) {
			const idx = order[col].indexOf(oldFolderName);
			if (idx !== -1) {
				order[col][idx] = newFolderName;
				changed = true;
			}
		}
		if (changed) {
			this.write(order);
		}
	}
}
