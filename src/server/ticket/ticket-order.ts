import { reconcileOrder } from './ticket-order-reconcile.js';
import { TicketRepository } from './ticket-repository.js';
import type { TicketInfo } from './ticket-store.js';

export type TicketOrder = Record<string, string[]>;

export class TicketOrderStore {
	private worktreeDir: string;
	private repo: TicketRepository;

	constructor(worktreeDir: string, repo?: TicketRepository) {
		this.worktreeDir = worktreeDir;
		this.repo = repo ?? new TicketRepository();
	}

	read(): TicketOrder {
		try {
			const raw = this.repo.readOrderFile(this.worktreeDir);
			if (raw === null) return {};
			const parsed = JSON.parse(raw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
			for (const key of Object.keys(parsed)) {
				if (!Array.isArray(parsed[key])) return {};
			}
			return parsed as TicketOrder;
		} catch (err) {
			console.warn(`Failed to read ticket order:`, err);
			return {};
		}
	}

	write(order: TicketOrder): void {
		this.repo.writeOrderFile(this.worktreeDir, JSON.stringify(order, null, 2));
	}

	reconcile(tickets: TicketInfo[], columns: string[]): TicketOrder {
		const existing = this.read();
		const { order, changed } = reconcileOrder(existing, tickets, columns);
		if (changed) {
			this.write(order);
		}
		return order;
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
