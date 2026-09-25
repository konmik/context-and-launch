import * as v from 'valibot';
import { reconcileOrder } from './ticket-order-reconcile.js';
import { TicketRepository } from './ticket-repository.js';
import type { TicketInfo } from './ticket-store.js';

export type TicketOrder = Record<string, string[]>;

const TicketOrderSchema = v.record(v.string(), v.array(v.string()));

export class TicketOrderStore {
	constructor(
		private readonly worktreeDir: string,
		private readonly repo = new TicketRepository(),
	) {}

	read(): TicketOrder {
		const parsed = this.repo.readWorktreeJson(this.worktreeDir, 'ticket-order.json');
		const result = v.safeParse(TicketOrderSchema, parsed);
		return result.success ? result.output : {};
	}

	write(order: TicketOrder): void {
		this.repo.writeWorktreeJson(this.worktreeDir, 'ticket-order.json', order);
	}

	reconcileAndSave(tickets: TicketInfo[], columns: string[]): TicketOrder {
		const existing = this.read();
		const { order, changed } = reconcileOrder(existing, tickets, columns);
		if (changed) this.write(order);
		return order;
	}

	moveTicket(folderName: string, fromColumn: string, toColumn: string, newIndex: number): void {
		const order = this.read();
		const targetExisted = Object.hasOwn(order, toColumn);
		const next = { ...order };

		if (order[fromColumn]) {
			next[fromColumn] = order[fromColumn].filter(folder => folder !== folderName);
			if (next[fromColumn].length === 0 && fromColumn !== toColumn && !targetExisted) {
				delete next[fromColumn];
			}
		}

		const destination = (order[toColumn] ?? []).filter(folder => folder !== folderName);
		const insertionIndex = Math.max(0, Math.min(newIndex, destination.length));
		destination.splice(insertionIndex, 0, folderName);
		this.write({ ...next, [toColumn]: destination });
	}

	appendTicket(folderName: string, column: string): void {
		const order = this.read();
		const folders = order[column] ?? [];
		this.write({ ...order, [column]: folders.includes(folderName) ? folders : [...folders, folderName] });
	}

	removeTicket(folderName: string): void {
		const order = this.read();
		if (!Object.values(order).some(folders => folders.includes(folderName))) return;
		this.write(Object.fromEntries(Object.entries(order).map(([column, folders]) =>
			[column, folders.filter(folder => folder !== folderName)])));
	}

	renameTicket(oldFolderName: string, newFolderName: string): void {
		const order = this.read();
		if (!Object.values(order).some(folders => folders.includes(oldFolderName))) return;
		this.write(Object.fromEntries(Object.entries(order).map(([column, folders]) => {
			const renamedIndex = folders.indexOf(oldFolderName);
			return [column, folders.map((folder, index) => index === renamedIndex ? newFolderName : folder)];
		})));
	}
}
