import fs from 'fs';
import path from 'path';
import { ConfigRepository } from '../config/config-repository.js';

export interface StatusJson {
	number: string;
	title: string;
	status: string;
	useWorktree: boolean;
	createdAt?: string;
	references?: { path: string }[];
}

export class TicketRepository {
	private configRepo: ConfigRepository;

	constructor(configRepo?: ConfigRepository) {
		this.configRepo = configRepo ?? new ConfigRepository();
	}

	readStatusJson(dir: string): StatusJson | null {
		const file = path.join(dir, 'status.json');
		let raw: unknown;
		try {
			raw = this.configRepo.readJson(file);
		} catch (err) {
			console.warn(`Malformed status.json in ${dir}:`, err);
			return null;
		}
		if (raw === null) return null;
		return { useWorktree: false, ...(raw as Record<string, unknown>) } as StatusJson;
	}

	writeStatusJson(dir: string, status: StatusJson): void {
		this.configRepo.writeJson(path.join(dir, 'status.json'), status);
	}

	readOrderJson(worktreeDir: string): unknown | null {
		const filePath = path.join(worktreeDir, 'ticket-order.json');
		try {
			return this.configRepo.readJson(filePath);
		} catch (err) {
			console.warn(`Failed to read ticket order from ${filePath}:`, err);
			return null;
		}
	}

	writeOrderJson(worktreeDir: string, data: unknown): void {
		this.configRepo.writeJson(path.join(worktreeDir, 'ticket-order.json'), data);
	}

	listEntries(parentDir: string): fs.Dirent[] {
		if (!fs.existsSync(parentDir)) return [];
		return fs.readdirSync(parentDir, { withFileTypes: true });
	}

	createDirectory(dir: string): void {
		fs.mkdirSync(dir, { recursive: true });
	}

	removeDirectory(dir: string): void {
		fs.rmSync(dir, { recursive: true, force: true });
	}

	renameDirectory(from: string, to: string): void {
		fs.renameSync(from, to);
	}

	readFile(filePath: string): Buffer {
		return fs.readFileSync(filePath);
	}

	readFileText(filePath: string): string {
		return fs.readFileSync(filePath, 'utf-8');
	}

	writeFile(filePath: string, content: Buffer | string): void {
		fs.writeFileSync(filePath, content);
	}

	deleteFile(filePath: string): void {
		fs.unlinkSync(filePath);
	}

	exists(filePath: string): boolean {
		return fs.existsSync(filePath);
	}

	isDirectory(filePath: string): boolean {
		return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
	}

	realpathSync(filePath: string): string {
		return fs.realpathSync(filePath);
	}
}
