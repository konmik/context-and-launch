import fs from 'fs';
import path from 'path';
import { TicketOrderStore } from './ticket-order.js';
import { suggestNextTicketNumber } from './ticket-number.js';
import type { TicketOrder } from './ticket-order.js';

export interface TicketInfo {
	number: string;
	title: string;
	status: string;
	folderName: string;
	contextNames: string[];
	useWorktree: boolean;
	fileNames: string[];
	references: { path: string; exists: boolean }[];
}

export interface CreateTicketRequest {
	number: string;
	title: string;
}

export interface UpdateTicketRequest {
	number?: string;
	title?: string;
	status?: string;
}

export interface DocContent {
	content: string;
}

interface StatusJson {
	number: string;
	title: string;
	status: string;
	useWorktree: boolean;
	createdAt?: string;
	references?: { path: string }[];
}

export function toKebabCase(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export class TicketStore {
	private worktreeDir: string;
	private orderStore: TicketOrderStore;

	constructor(worktreeDir: string) {
		this.worktreeDir = worktreeDir;
		this.orderStore = new TicketOrderStore(worktreeDir);
	}

	private requireContained(filePath: string, label: string): void {
		this.requireContainedIn(filePath, this.worktreeDir, label);
	}

	private requireContainedIn(filePath: string, parent: string, label: string): void {
		// Resolve the canonical path. If the file doesn't exist yet,
		// resolve its parent directory and append the filename.
		let canonical: string;
		if (fs.existsSync(filePath)) {
			canonical = fs.realpathSync(filePath);
		} else {
			const dir = path.dirname(filePath);
			const base = path.basename(filePath);
			if (fs.existsSync(dir)) {
				canonical = path.join(fs.realpathSync(dir), base);
			} else {
				canonical = path.resolve(filePath);
			}
		}
		if (!fs.existsSync(parent)) {
			throw new Error(`Worktree directory does not exist: ${parent}`);
		}
		const root = fs.realpathSync(parent) + path.sep;
		if (!canonical.startsWith(root)) {
			throw new Error(`${label} escapes allowed directory: ${canonical}`);
		}
	}

	private requireNonBlank(value: string, label: string): string {
		const trimmed = value.trim();
		if (!trimmed) throw new Error(`${label} must not be blank`);
		return trimmed;
	}

	private requireSimpleName(name: string, label: string): void {
		if (name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
			throw new Error(
				`${label} must be a simple name without path separators: ${name}`
			);
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
		this.requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			throw new Error(`Ticket not found: ${folderName}`);
		}
		return dir;
	}

	listTickets(): TicketInfo[] {
		if (!fs.existsSync(this.worktreeDir)) return [];
		const entries = fs.readdirSync(this.worktreeDir, { withFileTypes: true });
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
		fs.mkdirSync(dir, { recursive: true });

		const status: StatusJson = {
			number: number.trim(),
			title: title.trim(),
			status: initialStatus,
			useWorktree: false,
			createdAt: new Date().toISOString(),
		};
		this.writeStatusJson(dir, status);

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
		const current = this.readStatusJson(dir);
		if (!current) throw new Error(`Malformed ticket: ${folderName}`);

		const updatedNumber = number != null ? this.requireNonBlank(number, 'Ticket number') : current.number;
		const updatedTitle = title != null ? this.requireNonBlank(title, 'Ticket title') : current.title;
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
				if (fs.existsSync(newDir)) {
					throw new Error(`Folder name collision: ${newFolderName}`);
				}
				try {
					fs.renameSync(dir, newDir);
				} catch (err) {
					throw new Error(
						`Failed to rename ticket folder from ${path.basename(dir)} to ${newFolderName}`,
						{ cause: err }
					);
				}
				finalDir = newDir;
			}
		}

		this.writeStatusJson(finalDir, updated);

		if (needsRename && path.basename(finalDir) !== folderName) {
			this.orderStore.renameTicket(folderName, path.basename(finalDir));
		}

		return this.readTicket(finalDir)!;
	}

	deleteTicket(folderName: string): void {
		const dir = this.resolveTicketDir(folderName);
		fs.rmSync(dir, { recursive: true, force: true });
		this.orderStore.removeTicket(folderName);
	}

	archiveTicket(folderName: string): void {
		const dir = this.resolveTicketDir(folderName);
		const archiveDir = path.join(this.worktreeDir, 'archive');
		fs.mkdirSync(archiveDir, { recursive: true });
		const dest = path.join(archiveDir, folderName);
		if (fs.existsSync(dest)) {
			throw new Error(`Archive destination already exists: ${folderName}`);
		}
		fs.renameSync(dir, dest);
		this.orderStore.removeTicket(folderName);
	}

	setUseWorktree(folderName: string, value: boolean): void {
		const dir = this.resolveTicketDir(folderName);
		const current = this.readStatusJson(dir);
		if (!current) throw new Error(`Ticket not found: ${folderName}`);
		this.writeStatusJson(dir, { ...current, useWorktree: value });
	}

	getTicketContext(folderName: string, name: string): string | null {
		this.requireSimpleName(name, 'name');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			return null;
		}
		const file = path.join(dir, `${name}.md`);
		this.requireContained(file, 'name');
		this.requireContainedIn(file, dir, 'name');
		return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
	}

	deleteTicketContext(folderName: string, name: string): void {
		this.requireSimpleName(name, 'name');
		const dir = this.resolveTicketDir(folderName);
		const file = path.join(dir, `${name}.md`);
		this.requireContained(file, 'name');
		this.requireContainedIn(file, dir, 'name');
		if (!fs.existsSync(file)) return;
		fs.unlinkSync(file);
	}

	saveTicketContext(folderName: string, name: string, content: string): void {
		if (typeof content !== 'string') {
			throw new TypeError('content must be a string');
		}
		this.requireSimpleName(name, 'name');
		const dir = this.resolveTicketDir(folderName);
		const file = path.join(dir, `${name}.md`);
		this.requireContained(file, 'name');
		this.requireContainedIn(file, dir, 'name');
		fs.writeFileSync(file, content);
	}

	listAllTicketNumbers(): Array<{ number: string; createdAt?: string }> {
		const results: Array<{ number: string; createdAt?: string }> = [];

		const scanDir = (dir: string) => {
			if (!fs.existsSync(dir)) return;
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'archive') continue;
				const status = this.readStatusJson(path.join(dir, entry.name));
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
		const status = this.readStatusJson(dir);
		if (!status) return null;
		const entries = fs.readdirSync(dir, { withFileTypes: true });
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
			exists: fs.existsSync(ref.path),
		}));
		return {
			number: status.number,
			title: status.title,
			status: status.status,
			folderName: path.basename(dir),
			contextNames,
			useWorktree: status.useWorktree === true,
			fileNames,
			references,
		};
	}

	listTicketFiles(folderName: string): string[] {
		const dir = this.resolveTicketDir(folderName);
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile() && e.name !== 'status.json')
			.map((e) => e.name)
			.sort();
	}

	copyFileToTicket(folderName: string, fileName: string, content: Buffer): void {
		this.requireSimpleName(fileName, 'fileName');
		if (fileName === 'status.json') {
			throw new Error('Cannot overwrite status.json');
		}
		const dir = this.resolveTicketDir(folderName);
		const filePath = path.join(dir, fileName);
		this.requireContainedIn(filePath, dir, 'fileName');
		fs.writeFileSync(filePath, content);
	}

	deleteTicketFile(folderName: string, fileName: string): void {
		this.requireSimpleName(fileName, 'fileName');
		if (fileName === 'status.json') {
			throw new Error('Cannot delete status.json');
		}
		const dir = this.resolveTicketDir(folderName);
		const filePath = path.join(dir, fileName);
		this.requireContainedIn(filePath, dir, 'fileName');
		if (!fs.existsSync(filePath)) {
			throw new Error(`File not found: ${fileName}`);
		}
		fs.unlinkSync(filePath);
	}

	getFileContent(folderName: string, fileName: string): Buffer {
		this.requireSimpleName(fileName, 'fileName');
		const dir = this.resolveTicketDir(folderName);
		const filePath = path.join(dir, fileName);
		this.requireContainedIn(filePath, dir, 'fileName');
		if (!fs.existsSync(filePath)) {
			throw new Error(`File not found: ${fileName}`);
		}
		return fs.readFileSync(filePath);
	}

	addReference(folderName: string, refPath: string): void {
		const dir = this.resolveTicketDir(folderName);
		const status = this.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const refs = status.references ?? [];
		if (refs.some((r) => r.path === refPath)) return;
		refs.push({ path: refPath });
		this.writeStatusJson(dir, { ...status, references: refs });
	}

	removeReference(folderName: string, refPath: string): void {
		const dir = this.resolveTicketDir(folderName);
		const status = this.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const refs = (status.references ?? []).filter((r) => r.path !== refPath);
		this.writeStatusJson(dir, { ...status, references: refs });
	}

	getReferencedFileContent(folderName: string, refPath: string): Buffer {
		const dir = this.resolveTicketDir(folderName);
		const status = this.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const refs = status.references ?? [];
		if (!refs.some((r) => r.path === refPath)) {
			throw new Error(`Path is not a registered reference of ticket ${status.number}: ${refPath}`);
		}
		if (!fs.existsSync(refPath)) {
			throw new Error(`Referenced file not found: ${refPath}`);
		}
		return fs.readFileSync(refPath);
	}

	private readStatusJson(dir: string): StatusJson | null {
		const file = path.join(dir, 'status.json');
		if (!fs.existsSync(file)) return null;
		try {
			const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
			return { useWorktree: false, ...raw } as StatusJson;
		} catch (err) {
			console.warn(`Malformed status.json in ${dir}:`, err);
			return null;
		}
	}

	private writeStatusJson(dir: string, status: StatusJson): void {
		fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status, null, 2));
	}

	private resolveUniqueFolderPath(baseName: string): string {
		let dir = path.join(this.worktreeDir, baseName);
		if (!fs.existsSync(dir)) return dir;
		let i = 2;
		while (true) {
			dir = path.join(this.worktreeDir, `${baseName}-${i}`);
			if (!fs.existsSync(dir)) return dir;
			i++;
		}
	}
}
