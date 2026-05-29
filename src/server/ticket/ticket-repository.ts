import fs from 'fs';
import path from 'path';

export interface StatusJson {
	number: string;
	title: string;
	status: string;
	useWorktree: boolean;
	createdAt?: string;
	references?: { path: string }[];
}

export class TicketRepository {
	readStatusJson(dir: string): StatusJson | null {
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

	writeStatusJson(dir: string, status: StatusJson): void {
		fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status, null, 2));
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

	readOrderFile(worktreeDir: string): string | null {
		const filePath = path.join(worktreeDir, 'ticket-order.json');
		if (!fs.existsSync(filePath)) return null;
		try {
			return fs.readFileSync(filePath, 'utf-8');
		} catch (err) {
			console.warn(`Failed to read ticket order from ${filePath}:`, err);
			return null;
		}
	}

	writeOrderFile(worktreeDir: string, content: string): void {
		fs.writeFileSync(path.join(worktreeDir, 'ticket-order.json'), content);
	}
}
