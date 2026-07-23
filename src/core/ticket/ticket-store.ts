import path from 'path';
import type { Dirent } from 'fs';
import * as v from 'valibot';
import { TicketOrderStore } from './ticket-order.js';
import { ForestLayoutStore } from './forest-layout-store.js';
import { suggestNextTicketNumber } from './ticket-number.js';
import { toKebabCase, normalizeTicketNumber, requireNonBlank, requireSimpleName } from './ticket-naming.js';
import { TicketRepository } from './ticket-repository.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';
import { mapConcurrent } from '../shared/concurrency.js';
import {
	wouldCreateDependencyCycle,
	wouldCreateMembershipCycle,
	rewriteInboundReferences,
	removeInboundReferences,
	type TicketRelation,
} from './ticket-relations.js';
import type { StatusJson } from './ticket-repository.js';
import type { TicketOrder } from './ticket-order.js';

export { toKebabCase } from './ticket-naming.js';

const READ_CONCURRENCY = 32;

const isTicketDirEntry = (entry: Dirent): boolean =>
	entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'archive';

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
	agentWorktreeBranchName?: string;
	agentWorktreeDir?: string;
	dependsOn?: string[];
	memberOf?: string;
	createdAt?: string;
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
	private forestLayoutStore: ForestLayoutStore;
	private repo: TicketRepository;
	private worktreeRootWithSep?: string;

	constructor(worktreeDir: string, repo?: TicketRepository) {
		this.worktreeDir = worktreeDir;
		this.repo = repo ?? new TicketRepository();
		this.orderStore = new TicketOrderStore(worktreeDir, this.repo);
		this.forestLayoutStore = new ForestLayoutStore(worktreeDir, this.repo);
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
		const root = parent === this.worktreeDir
			? this.cachedWorktreeRootWithSep()
			: this.resolveRootWithSep(parent);
		if (!canonical.startsWith(root)) {
			throw new Error(`${label} escapes allowed directory: ${canonical}`);
		}
	}

	private resolveRootWithSep(parent: string): string {
		if (!this.repo.exists(parent)) {
			throw new Error(`Worktree directory does not exist: ${parent}`);
		}
		return this.repo.realpathSync(parent) + path.sep;
	}

	private cachedWorktreeRootWithSep(): string {
		if (this.worktreeRootWithSep === undefined) {
			this.worktreeRootWithSep = this.resolveRootWithSep(this.worktreeDir);
		}
		return this.worktreeRootWithSep;
	}

	readOrderStore(): TicketOrderStore {
		return this.orderStore;
	}

	readForestLayoutStore(): ForestLayoutStore {
		return this.forestLayoutStore;
	}

	moveTicket(folderName: string, fromColumn: string, toColumn: string, newIndex: number): void {
		if (fromColumn !== toColumn) {
			this.updateTicket(folderName, null, null, toColumn);
		}
		this.orderStore.moveTicket(folderName, fromColumn, toColumn, newIndex);
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
		const tickets: TicketInfo[] = [];
		for (const dir of this.ticketDirs(false)) {
			const ticket = this.readTicket(dir);
			if (ticket) tickets.push(ticket);
		}
		return this.dedupeAndSortTickets(tickets);
	}

	private dedupeAndSortTickets(tickets: TicketInfo[]): TicketInfo[] {
		const numbers = new Map<string, string>();
		for (const ticket of tickets) {
			const normalizedNumber = normalizeTicketNumber(ticket.number);
			const existingNumber = numbers.get(normalizedNumber);
			if (existingNumber) {
				throw new ValidationError(`Duplicate Ticket Number: ${existingNumber}`);
			}
			numbers.set(normalizedNumber, ticket.number);
		}
		tickets.sort((a, b) => a.number.toLowerCase().localeCompare(b.number.toLowerCase()));
		return tickets;
	}

	createTicket(number: string, title: string, initialStatus = 'todo', memberOf?: string): TicketInfo {
		if (!number.trim()) throw new Error('Ticket number must not be blank');
		if (!title.trim()) throw new Error('Ticket title must not be blank');
		this.assertTicketNumberAvailable(number);

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
		if (memberOf !== undefined) statusData.memberOf = memberOf;
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
		return this.repo.runInTransaction(this.worktreeDir, () => {
		const dir = this.resolveTicketDir(folderName);
		const current = this.repo.readStatusJson(dir);
		if (!current) throw new Error(`Malformed ticket: ${folderName}`);

		const updatedNumber = number != null ? requireNonBlank(number, 'Ticket number') : current.number;
		const updatedTitle = title != null ? requireNonBlank(title, 'Ticket title') : current.title;
		const updatedStatus = status ?? current.status;

		const updated: StatusJson = { ...current, number: updatedNumber, title: updatedTitle, status: updatedStatus };

		const numberChanged = number != null && number.trim() !== current.number;
		const numberIdentityChanged = number != null
			&& normalizeTicketNumber(number) !== normalizeTicketNumber(current.number);
		const needsRename = numberChanged || (title != null && title.trim() !== current.title);
		if (numberIdentityChanged) {
			this.assertTicketNumberAvailable(updatedNumber, dir);
		}

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

		if (numberChanged) {
			const oldNumber = current.number;
			const newNumber = updatedNumber;
			for (const ticketDir of this.ticketDirs(true)) {
				if (ticketDir === finalDir) continue;
				const status = this.repo.readStatusJson(ticketDir);
				if (!status) continue;
				const rewritten = rewriteInboundReferences(status, oldNumber, newNumber);
				if (rewritten) this.repo.writeStatusJson(ticketDir, rewritten);
			}
			this.forestLayoutStore.renameTicket(oldNumber, newNumber);
		}

		return this.readTicket(finalDir)!;
		});
	}

	deleteTicket(folderName: string): void {
		this.repo.runInTransaction(this.worktreeDir, () => {
		const dir = this.resolveTicketDir(folderName);
		const status = this.repo.readStatusJson(dir);
		const ticketNumber = status?.number;
		this.repo.removeDirectory(dir);
		this.orderStore.removeTicket(folderName);
		if (ticketNumber) {
			for (const ticketDir of this.ticketDirs(true)) {
				const s = this.repo.readStatusJson(ticketDir);
				if (!s) continue;
				const cleaned = removeInboundReferences(s, ticketNumber);
				if (cleaned) this.repo.writeStatusJson(ticketDir, cleaned);
			}
			this.forestLayoutStore.removeTicket(ticketNumber);
		}
		});
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

	saveAgentWorktreeInfo(folderName: string, agentWorktreeBranchName: string, agentWorktreeDir: string): void {
		const dir = this.resolveTicketDir(folderName);
		const current = this.repo.readStatusJson(dir);
		if (!current) throw new Error(`Ticket not found: ${folderName}`);
		this.repo.writeStatusJson(dir, { ...current, agentWorktreeBranchName, agentWorktreeDir });
	}

	clearAgentWorktreeInfo(folderName: string): void {
		const dir = this.resolveTicketDir(folderName);
		const current = this.repo.readStatusJson(dir);
		if (!current) throw new Error(`Ticket not found: ${folderName}`);
		const { agentWorktreeBranchName, agentWorktreeDir, ...rest } = current;
		this.repo.writeStatusJson(dir, rest as StatusJson);
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
		for (const dir of this.ticketDirs(true)) {
			const status = this.repo.readStatusJson(dir);
			if (status) {
				results.push({ number: status.number, createdAt: status.createdAt });
			}
		}
		return results;
	}

	suggestNextNumber(prefix?: string | null): string | null {
		return suggestNextTicketNumber(this.listAllTicketNumbers(), prefix);
	}

	private readTicket(dir: string): TicketInfo | null {
		const status = this.repo.readStatusJson(dir);
		if (!status) return null;
		const entries = this.repo.listEntries(dir);
		const references = (status.references ?? []).map((ref) => ({
			path: ref.path,
			exists: this.repo.exists(ref.path),
		}));
		return this.buildTicketInfo(dir, status, entries, references);
	}

	private buildTicketInfo(
		dir: string,
		status: StatusJson,
		entries: Dirent[],
		references: { path: string; exists: boolean }[],
	): TicketInfo {
		const contextNames = entries
			.filter((e) => e.isFile() && e.name.endsWith('.md'))
			.map((e) => e.name.replace(/\.md$/, ''))
			.sort();
		const fileNames = entries
			.filter((e) => e.isFile() && e.name !== 'status.json')
			.map((e) => e.name)
			.sort();
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
			agentWorktreeBranchName: status.agentWorktreeBranchName,
			agentWorktreeDir: status.agentWorktreeDir,
			dependsOn: status.dependsOn,
			memberOf: status.memberOf,
			createdAt: status.createdAt,
		};
	}

	async loadBoardSnapshot(
		columns: string[],
	): Promise<{ tickets: TicketInfo[]; ticketOrder: TicketOrder; suggestedNextNumber: string | null }> {
		const activeDirs = await this.ticketDirsIn(this.worktreeDir);
		const tickets = this.dedupeAndSortTickets(
			(await mapConcurrent(activeDirs, READ_CONCURRENCY, (dir) => this.readTicketAsync(dir)))
				.filter((t): t is TicketInfo => t !== null),
		);
		const ticketOrder = this.orderStore.reconcile(tickets, columns);

		const archiveDirs = await this.ticketDirsIn(path.join(this.worktreeDir, 'archive'));
		const archiveStatuses = (
			await mapConcurrent(archiveDirs, READ_CONCURRENCY, (dir) => this.repo.readStatusJsonAsync(dir))
		).filter((s): s is StatusJson => s !== null);

		const suggestedNextNumber = suggestNextTicketNumber([...tickets, ...archiveStatuses]);
		return { tickets, ticketOrder, suggestedNextNumber };
	}

	private async ticketDirsIn(parentDir: string): Promise<string[]> {
		const entries = await this.repo.listEntriesAsync(parentDir);
		return entries.filter(isTicketDirEntry).map((e) => path.join(parentDir, e.name));
	}

	private async readTicketAsync(dir: string): Promise<TicketInfo | null> {
		const status = await this.repo.readStatusJsonAsync(dir);
		if (!status) return null;
		const entries = await this.repo.listEntriesAsync(dir);
		const references = (status.references ?? []).map((ref) => ({
			path: ref.path,
			exists: this.repo.exists(ref.path),
		}));
		return this.buildTicketInfo(dir, status, entries, references);
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

	addDependency(folderName: string, dependencyNumber: string): void {
		const dir = this.resolveTicketDir(folderName);
		const status = this.repo.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const tickets = this.listTickets();
		if (!tickets.some(t => t.number === dependencyNumber)) {
			throw new ValidationError(`Dependency target does not exist: ${dependencyNumber}`);
		}
		const existing = status.dependsOn ?? [];
		if (existing.includes(dependencyNumber)) return;
		if (wouldCreateDependencyCycle(tickets, status.number, dependencyNumber)) {
			throw new ValidationError('Dependency would create a cycle');
		}
		this.repo.writeStatusJson(dir, { ...status, dependsOn: [...existing, dependencyNumber] });
	}

	removeDependency(folderName: string, dependencyNumber: string): void {
		const dir = this.resolveTicketDir(folderName);
		const status = this.repo.readStatusJson(dir);
		if (!status) throw new Error(`Malformed ticket: ${folderName}`);
		const filtered = (status.dependsOn ?? []).filter(n => n !== dependencyNumber);
		const updated: StatusJson = { ...status, dependsOn: filtered.length > 0 ? filtered : undefined };
		this.repo.writeStatusJson(dir, updated);
	}

	createGroup(
		number: string,
		title: string,
		initialStatus: string,
		memberFolderNames: string[],
		parentGroupNumber?: string,
		position?: { x: number; y: number },
	): TicketInfo {
		return this.repo.runInTransaction(this.worktreeDir, () => {
		const memberInfos: Array<{ dir: string; status: StatusJson }> = [];
		for (const fn of memberFolderNames) {
			const dir = this.resolveTicketDir(fn);
			const status = this.repo.readStatusJson(dir);
			if (!status) throw new NotFoundError(`Member ticket not found: ${fn}`);
			memberInfos.push({ dir, status });
		}
		const memberNumbers = memberInfos.map(m => m.status.number);
		const allTickets: TicketRelation[] = this.listTickets();
		if (parentGroupNumber !== undefined) {
			allTickets.push({ number, memberOf: parentGroupNumber });
		}
		if (wouldCreateMembershipCycle(allTickets, memberNumbers, number)) {
			throw new ValidationError('Grouping would create a membership cycle');
		}
		const groupTicket = this.createTicket(number, title, initialStatus, parentGroupNumber);
		for (const member of memberInfos) {
			this.repo.writeStatusJson(member.dir, { ...member.status, memberOf: number });
		}
		if (position) {
			this.forestLayoutStore.translateIntoGroup(number, position, memberNumbers);
		}
		return groupTicket;
		});
	}

	ungroup(folderName: string): void {
		this.repo.runInTransaction(this.worktreeDir, () => {
		const dir = this.resolveTicketDir(folderName);
		const groupStatus = this.repo.readStatusJson(dir);
		if (!groupStatus) throw new Error(`Malformed ticket: ${folderName}`);
		const memberNumbers: string[] = [];
		for (const ticketDir of this.ticketDirs(false)) {
			const status = this.repo.readStatusJson(ticketDir);
			if (!status || status.memberOf !== groupStatus.number) continue;
			memberNumbers.push(status.number);
			this.repo.writeStatusJson(ticketDir, { ...status, memberOf: groupStatus.memberOf });
		}
		this.forestLayoutStore.translateOutOfGroup(groupStatus.number, memberNumbers);
		});
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

	private ticketDirs(includeArchive: boolean): string[] {
		const dirs: string[] = [];
		const scan = (parentDir: string) => {
			if (!this.repo.exists(parentDir)) return;
			const entries = this.repo.listEntries(parentDir);
			for (const entry of entries) {
				if (!isTicketDirEntry(entry)) continue;
				dirs.push(path.join(parentDir, entry.name));
			}
		};
		scan(this.worktreeDir);
		if (includeArchive) {
			scan(path.join(this.worktreeDir, 'archive'));
		}
		return dirs;
	}

	private assertTicketNumberAvailable(number: string, excludedDir?: string): void {
		const normalized = normalizeTicketNumber(number);
		for (const ticketDir of this.ticketDirs(true)) {
			if (ticketDir === excludedDir) continue;
			const status = this.repo.readStatusJson(ticketDir);
			if (status && normalizeTicketNumber(status.number) === normalized) {
				throw new ValidationError(`Ticket Number already exists: ${status.number}`);
			}
		}
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
