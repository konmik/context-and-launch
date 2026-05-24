import fs from 'fs';
import path from 'path';
import { gitSync } from './git.js';
import type { TicketInfo } from '../types.js';

interface StatusJson {
	number: string;
	title: string;
	status: string;
	useWorktree: boolean;
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

	constructor(worktreeDir: string) {
		this.worktreeDir = worktreeDir;
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
		};
		this.writeStatusJson(dir, status);
		this.autoCommit(`create ticket ${status.number}`);

		return this.readTicket(dir)!;
	}

	updateTicket(
		folderName: string,
		number?: string | null,
		title?: string | null,
		status?: string | null
	): TicketInfo {
		this.requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			throw new Error(`Ticket not found: ${folderName}`);
		}

		const current = this.readStatusJson(dir);
		if (!current) throw new Error(`Malformed ticket: ${folderName}`);

		const updatedNumber = number != null ? this.requireNonBlank(number, 'Ticket number') : current.number;
		const updatedTitle = title != null ? this.requireNonBlank(title, 'Ticket title') : current.title;
		const updatedStatus = status ?? current.status;

		const updated: StatusJson = {
			...current,
			number: updatedNumber,
			title: updatedTitle,
			status: updatedStatus,
			useWorktree: current.useWorktree,
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
				} catch {
					throw new Error(
						`Failed to rename ticket folder from ${path.basename(dir)} to ${newFolderName}`
					);
				}
				finalDir = newDir;
			}
		}

		this.writeStatusJson(finalDir, updated);
		this.autoCommit(`update ticket ${updated.number}`);

		return this.readTicket(finalDir)!;
	}

	deleteTicket(folderName: string): void {
		this.requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			throw new Error(`Ticket not found: ${folderName}`);
		}
		const status = this.readStatusJson(dir);
		const number = status?.number ?? folderName;
		fs.rmSync(dir, { recursive: true, force: true });
		this.autoCommit(`delete ticket ${number}`);
	}

	archiveTicket(folderName: string): void {
		this.requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			throw new Error(`Ticket not found: ${folderName}`);
		}
		const status = this.readStatusJson(dir);
		const number = status?.number ?? folderName;
		const archiveDir = path.join(this.worktreeDir, 'archive');
		fs.mkdirSync(archiveDir, { recursive: true });
		const dest = path.join(archiveDir, folderName);
		if (fs.existsSync(dest)) {
			throw new Error(`Archive destination already exists: ${folderName}`);
		}
		fs.renameSync(dir, dest);
		this.autoCommit(`archive ticket ${number}`);
	}

	setUseWorktree(folderName: string, value: boolean): void {
		this.requireSimpleName(folderName, 'folderName');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		const current = this.readStatusJson(dir);
		if (!current) throw new Error(`Ticket not found: ${folderName}`);
		this.writeStatusJson(dir, { ...current, useWorktree: value });
		this.autoCommit(`set useWorktree for ${current.number}`);
	}

	getStageMarkdown(folderName: string, stage: string): string | null {
		this.requireSimpleName(folderName, 'folderName');
		this.requireSimpleName(stage, 'stage');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			return null;
		}
		const file = path.join(dir, `${stage}.md`);
		this.requireContained(file, 'stage');
		this.requireContainedIn(file, dir, 'stage');
		return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
	}

	deleteStageMarkdown(folderName: string, stage: string): void {
		this.requireSimpleName(folderName, 'folderName');
		this.requireSimpleName(stage, 'stage');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			throw new Error(`Ticket not found: ${folderName}`);
		}
		const file = path.join(dir, `${stage}.md`);
		this.requireContained(file, 'stage');
		this.requireContainedIn(file, dir, 'stage');
		if (!fs.existsSync(file)) return;
		fs.unlinkSync(file);
		const status = this.readStatusJson(dir);
		const number = status?.number ?? folderName;
		this.autoCommit(`delete ${stage} for ${number}`);
	}

	saveStageMarkdown(folderName: string, stage: string, content: string): void {
		if (typeof content !== 'string') {
			throw new TypeError('content must be a string');
		}
		this.requireSimpleName(folderName, 'folderName');
		this.requireSimpleName(stage, 'stage');
		const dir = path.join(this.worktreeDir, folderName);
		this.requireContained(dir, 'folderName');
		if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
			throw new Error(`Ticket not found: ${folderName}`);
		}
		const file = path.join(dir, `${stage}.md`);
		this.requireContained(file, 'stage');
		this.requireContainedIn(file, dir, 'stage');
		fs.writeFileSync(file, content);
		const status = this.readStatusJson(dir);
		const number = status?.number ?? folderName;
		this.autoCommit(`update ${stage} for ${number}`);
	}

	private readTicket(dir: string): TicketInfo | null {
		const status = this.readStatusJson(dir);
		if (!status) return null;
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		const stageNames = entries
			.filter((e) => e.isFile() && e.name.endsWith('.md'))
			.map((e) => e.name.replace(/\.md$/, ''))
			.sort();
		return {
			number: status.number,
			title: status.title,
			status: status.status,
			folderName: path.basename(dir),
			stageNames,
			useWorktree: status.useWorktree === true,
		};
	}

	private readStatusJson(dir: string): StatusJson | null {
		const file = path.join(dir, 'status.json');
		if (!fs.existsSync(file)) return null;
		try {
			const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
			return { useWorktree: false, ...raw } as StatusJson;
		} catch {
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

	private autoCommit(message: string): void {
		try {
			gitSync(this.worktreeDir, 'add', '-A');
			const status = gitSync(this.worktreeDir, 'status', '--porcelain');
			if (!status.trim()) return;
			gitSync(this.worktreeDir, 'commit', '-m', message);
		} catch (err) {
			console.warn(`autoCommit failed (${message}):`, err);
		}
	}
}
