import path from 'path';
import * as v from 'valibot';
import { TicketOrderStore } from './ticket-order.js';
import { suggestNextTicketNumber } from './ticket-number.js';
import { toKebabCase, requireNonBlank, requireSimpleName } from './ticket-naming.js';
import { TicketRepository } from './ticket-repository.js';
import type { StatusJson } from './ticket-repository.js';
import type { TicketOrder } from './ticket-order.js';

export { toKebabCase } from './ticket-naming.js';

export interface TicketInfo {
	number: string;
	title: string;
	status: string;
	folderName: string;
	contextNames: string[];
	useWorktree: boolean;
	hasAgentWorktree: boolean;
	fileNames: string[];
	references: { path: string; exists: boolean }[];
}

export const CreateTicketBody = v.object({
	number: v.string(),
	title: v.string(),
});
export type CreateTicketBody = v.InferOutput<typeof CreateTicketBody>;

export const UpdateTicketBody = v.object({
	number: v.optional(v.string()),
	title: v.optional(v.string()),
	status: v.optional(v.string()),
});
export type UpdateTicketBody = v.InferOutput<typeof UpdateTicketBody>;

export const SaveContextBody = v.object({
	content: v.string(),
});
export type SaveContextBody = v.InferOutput<typeof SaveContextBody>;

export const UseWorktreeBody = v.object({
	useWorktree: v.boolean(),
});
export type UseWorktreeBody = v.InferOutput<typeof UseWorktreeBody>;

export const AddReferencesBody = v.object({
	paths: v.optional(v.array(v.string()), []),
});
export type AddReferencesBody = v.InferOutput<typeof AddReferencesBody>;

export const RemoveReferenceBody = v.object({
	path: v.string(),
});
export type RemoveReferenceBody = v.InferOutput<typeof RemoveReferenceBody>;

export const ReorderTicketBody = v.object({
	folderName: v.string(),
	fromColumn: v.string(),
	toColumn: v.string(),
	newIndex: v.number(),
});
export type ReorderTicketBody = v.InferOutput<typeof ReorderTicketBody>;

export class TicketStore {
	private worktreeDir: string;
	private orderStore: TicketOrderStore;
	private repo: TicketRepository;

	constructor(worktreeDir: string, repo?: TicketRepository) {
		this.worktreeDir = worktreeDir;
		this.repo = repo ?? new TicketRepository();
		this.orderStore = new TicketOrderStore(worktreeDir, this.repo);
	}

	private requireContained(filePath: string, label: string): void {
		this.requireContainedIn(filePath, this.worktreeDir, label);
	}

	private requireContainedIn(filePath: string, parent: string, label: string): void {
		let canonical: string;
		if (this.repo.exists(filePath)) {
			canonical = this.repo.realpathSync(filePath);
		} else {
			const dir = path.dirname(filePath);
			const base = path.basename(filePath);
			if (this.repo.exists(dir)) {
				canonical = path.join(this.repo.realpathSync(dir), base);
			} else {
				canonical = path.resolve(filePath);
			}
		}
		if (!this.repo.exists(parent)) {
			throw new Error(`Worktree directory does not exist: ${parent}`);
		}
		const root = this.repo.realpathSync(parent) + path.sep;
		if (!canonical.startsWith(root)) {
			throw new Error(`${label} escapes allowed directory: ${canonical}`);
		}
	}

	readOrderStore(): TicketOrderStore {
		return this.orderStore;
	}

	moveTicket(folderName: string, fromColumn: string, toColumn: string, newIndex: number): void {
		if (fromColumn !== toColumn) {
			this.updateTicket(folderName, null, null, toColumn);
		}
		this.orderStore.moveTicket(folderName, fromColumn, toColumn, newIndex);
	}

	loadBoardState(columns: string[]): { tickets: TicketInfo[]; ticketOrder: TicketOrder } {
		const tickets = this.listTickets();
		const ticketOrder = this.orderStore.reconcile(tickets, columns);
		return { tickets, ticketOrder };
	}

	private resolveTicketDir(folderName: string): string {
		requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!this.repo.isDirectory(dir)) {
			throw new Error(`Ticket not found: ${folderName}`);
		}
		return dir;
	}

	getTicket(folderName: string): TicketInfo | null {
		requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!this.repo.isDirectory(dir)) return null;
		return this.readTicket(dir);
	}

	listTickets(): TicketInfo[] {
		if (!this.repo.exists(this.worktreeDir)) return [];
		const entries = this.repo.listEntries(this.worktreeDir);
		const tickets: TicketInfo[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'archive') continue;
			const ticket = this.readTicket(path.join(this.worktreeDir, entry.name));
			if (ticket) tickets.push(ticket);
		}
		tickets.sort((a, b) => a.number.toLowerCase().localeCompare(b.number.toLowerCase()));
		return tickets;
	}

	createTicket(number: string, title: string, initialStatus = 'todo'): TicketInfo {
		if (!number.trim()) throw new Error('Ticket number must not be blank');
		if (!title.trim()) throw new Error('Ticket title must not be blank');

		const baseFolderName = toKebabCase(`${number} ${title}`);
		const dir = this.resolveUniqueFolderPath(baseFolderName);
		this.repo.createDirectory(dir);

		const statusData: StatusJson = {
			number: number.trim(),
			title: title.trim(),
			status: initialStatus,
			useWorktree: false,
			createdAt: new Date().toISOString(),
		};
		this.repo.writeStatusJson(dir, statusData);

		const ticket = this.readTicket(dir)!;
		this.orderStore.appendTicket(ticket.folderName, initialStatus);
		return ticket;
	}

	updateTicket(
		folderName: string,
		number?: string | null,
		title?: string | null,
		status?: string | null
	): TicketInfo {
		const dir = this.resolveTicketDir(folderName);
		const current = this.repo.readStatusJson(dir);
		if (!current) throw new Error(`Malformed ticket: ${folderName}`);

		const updatedNumber = number != null ? requireNonBlank(number, 'Ticket number') : current.number;
		const updatedTitle = title != null ? requireNonBlank(title, 'Ticket title') : current.title;
		const updatedStatus = status ?? current.status;

		const updated: StatusJson = {
			number: updatedNumber,
			title: updatedTitle,
			status: updatedStatus,
			useWorktree: current.useWorktree,
			createdAt: current.createdAt,
			references: current.references,
		};

		const needsRename =
			(number != null && number.trim() !== current.number) ||
			(title != null && title.trim() !== current.title);

		let finalDir = dir;
		if (needsRename) {
			const newFolderName = toKebabCase(`${updated.number} ${updated.title}`);
			if (newFolderName !== folderName) {
				const newDir = path.join(this.worktreeDir, newFolderName);
				if (this.repo.exists(newDir)) {
					throw new Error(`Folder name collision: ${newFolderName}`);
				}
				try {
					this.repo.renameDirectory(dir, newDir);
				} catch (err) {
					throw new Error(
						`Failed to rename ticket folder from ${path.basename(dir)} to ${newFolderName}`,
						{ cause: err }
					);
				}
				finalDir = newDir;
			}
		}

		this.repo.writeStatusJson(finalDir, updated);

		if (needsRename && path.basename(finalDir) !== folderName) {
			this.orderStore.renameTicket(folderName, path.basename(finalDir));
		}

		return this.readTicket(finalDir)!;
	}

	deleteTicket(folderName: string): void {
		const dir = this.resolveTicketDir(folderName);
		this.repo.removeDirectory(dir);
		this.orderStore.removeTicket(folderName);
	}

	archiveTicket(folderName: string): void {
		const dir = this.resolveTicketDir(folderName);
		const archiveDir = path.join(this.worktreeDir, 'archive');
		this.repo.createDirectory(archiveDir);
		const dest = path.join(archiveDir, folderName);
		if (this.repo.exists(dest)) {
			throw new Error(`Archive destination already exists: ${folderName}`);
		}
		this.repo.renameDirectory(dir, dest);
		this.orderStore.removeTicket(folderName);
	}

	setUseWorktree(folderName: string, value: boolean): void {
		const dir = this.resolveTicketDir(folderName);
		const current = this.repo.readStatusJson(dir);
		if (!current) throw new Error(`Ticket not found: ${folderName}`);
		this.repo.writeStatusJson(dir, { ...current, useWorktree: value });
	}

	getTicketContext(folderName: string, name: string): string | null {
		requireSimpleName(name, 'name');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!this.repo.isDirectory(dir)) {
			return null;
		}
		const file = path.join(dir, `${name}.md`);
		this.requireContained(file, 'name');
		this.requireContainedIn(file, dir, 'name');
		return this.repo.exists(file) ? this.repo.readFileText(file) : null;
	}

	deleteTicketContext(folderName: string, name: string): void {
		requireSimpleName(name, 'name');
		const dir = this.resolveTicketDir(folderName);
		const file = path.join(dir, `${name}.md`);
		this.requireContained(file, 'name');
		this.requireContainedIn(file, dir, 'name');
		if (!this.repo.exists(file)) return;
		this.repo.deleteFile(file);
	}

	saveTicketContext(folderName: string, name: string, content: string): void {
		if (typeof content !== 'string') {
			throw new TypeError('content must be a string');
		}
		requireSimpleName(name, 'name');
		const dir = this.resolveTicketDir(folderName);
		const file = path.join(dir, `${name}.md`);
		this.requireContained(file, 'name');
		this.requireContainedIn(file, dir, 'name');
		this.repo.writeFile(file, content);
	}

	listAllTicketNumbers(): Array<{ number: string; createdAt?: string }> {
		const results: Array<{ number: string; createdAt?: string }> = [];

		const scanDir = (dir: string) => {
			if (!this.repo.exists(dir)) return;
			const entries = this.repo.listEntries(dir);
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'archive') continue;
				const status = this.repo.readStatusJson(path.join(dir, entry.name));
				if (status) {
					results.push({ number: status.number, createdAt: status.createdAt });
				}
			}
		};

		scanDir(this.worktreeDir);
		scanDir(path.join(this.worktreeDir, 'archive'));

		return results;
	}

	suggestNextNumber(): string | null {
		return suggestNextTicketNumber(this.listAllTicketNumbers());
	}

	private readTicket(dir: string): TicketInfo | null {
		const status = this.repo.readStatusJson(dir);
		if (!status) return null;
		const entries = this.repo.listEntries(dir);
		const contextNames = entries
			.filter((e) => e.isFile() && e.name.endsWith('.md'))
			.map((e) => e.name.replace(/\.md$/, ''))
			.sort();
		const fileNames = entries
			.filter((e) => e.isFile() && e.name !== 'status.json')
			.map((e) => e.name)
			.sort();
		const references = (status.references ?? []).map((ref) => ({
			path: ref.path,
			exists: this.repo.exists(ref.path),
		}));
		return {
			number: status.number,
			title: status.title,
			status: status.status,
			folderName: path.basename(dir),
			contextNames,
			useWorktree: status.useWorktree === true,
			hasAgentWorktree: false,
			fileNames,
			references,
		};
	}

	listTicketFiles(folderName: string): string[] {
		const dir = this.resolveTicketDir(folderName);
		const entries = this.repo.listEntries(dir);
		return entries
			.filter((e) => e.isFile() && e.name !== 'status.json')
			.map((e) => e.name)
			.sort();
	}

	copyFileToTicket(folderName: string, fileName: string, content: Buffer): void {
		requireSimpleName(fileName, 'fileName');
		if (fileName === 'status.json') {
			throw new Error('Cannot overwrite status.json');
		}
		const dir = this.resolveTicketDir(folderName);
		const filePath = path.join(dir, fileName);
		this.requireContainedIn(filePath, dir, 'fileName');
		this.repo.writeFile(filePath, content);
	}

	deleteTicketFile(folderName: string, fileName: string): void {
		requireSimpleName(fileName, 'fileName');
		if (fileName === 'status.json') {
			throw new Error('Cannot delete status.json');
		}
		const dir = this.resolveTicketDir(folderName);
		const filePath = path.join(dir, fileName);
		this.requireContainedIn(filePath, dir, 'fileName');
		if (!this.repo.exists(filePath)) {
			throw new Error(`File not found: ${fileName}`);
		}
		this.repo.deleteFile(filePath);
	}

	getFileContent(folderName: string, fileName: string): Buffer {
		requireSimpleName(fileName, 'fileName');
		const dir = this.resolveTicketDir(folderName);
		const filePath = path.join(dir, fileName);
		this.requireContainedIn(filePath, dir, 'fileName');
		if (!this.repo.exists(filePath)) {
			throw new Error(`File not found: ${fileName}`);
		}
		return this.repo.readFile(filePath);
	}

	addReference(folderName: string, refPath: string): void {
		const dir = this.resolveTicketDir(folderName);
		const status = this.repo.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const refs = status.references ?? [];
		if (refs.some((r) => r.path === refPath)) return;
		refs.push({ path: refPath });
		this.repo.writeStatusJson(dir, { ...status, references: refs });
	}

	removeReference(folderName: string, refPath: string): void {
		const dir = this.resolveTicketDir(folderName);
		const status = this.repo.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const refs = (status.references ?? []).filter((r) => r.path !== refPath);
		this.repo.writeStatusJson(dir, { ...status, references: refs });
	}

	getReferencedFileContent(folderName: string, refPath: string): Buffer {
		const dir = this.resolveTicketDir(folderName);
		const status = this.repo.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const refs = status.references ?? [];
		if (!refs.some((r) => r.path === refPath)) {
			throw new Error(`Path is not a registered reference of ticket ${status.number}: ${refPath}`);
		}
		if (!this.repo.exists(refPath)) {
			throw new Error(`Referenced file not found: ${refPath}`);
		}
		return this.repo.readFile(refPath);
	}

	private resolveUniqueFolderPath(baseName: string): string {
		let dir = path.join(this.worktreeDir, baseName);
		if (!this.repo.exists(dir)) return dir;
		let i = 2;
		while (true) {
			dir = path.join(this.worktreeDir, `${baseName}-${i}`);
			if (!this.repo.exists(dir)) return dir;
			i++;
		}
	}
}
