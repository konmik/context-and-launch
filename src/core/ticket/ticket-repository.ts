import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import * as v from 'valibot';
import { ConfigRepository } from '../config/config-repository.js';

export const StatusJsonSchema = v.looseObject({
	number: v.string(),
	title: v.string(),
	status: v.string(),
	useWorktree: v.optional(v.boolean(), false),
	createdAt: v.optional(v.string()),
	references: v.optional(v.array(v.looseObject({ path: v.string() }))),
	agentWorktreeBranchName: v.optional(v.string()),
	agentWorktreeDir: v.optional(v.string()),
	dependsOn: v.optional(v.array(v.string())),
	memberOf: v.optional(v.string()),
});
export type StatusJson = v.InferOutput<typeof StatusJsonSchema>;

interface TransactionState {
	root: string;
	undo: Array<() => void>;
	finalize: Array<() => void>;
}

export class TicketRepository {
	private configRepo: ConfigRepository;
	private transactionState: TransactionState | null = null;

	constructor(configRepo?: ConfigRepository) {
		this.configRepo = configRepo ?? new ConfigRepository();
	}

	runInTransaction<T>(root: string, operation: () => T): T {
		const normalizedRoot = path.resolve(root);
		if (this.transactionState) {
			if (this.transactionState.root !== normalizedRoot) {
				throw new Error('Cannot nest ticket transactions for different worktrees');
			}
			return operation();
		}

		const state: TransactionState = { root: normalizedRoot, undo: [], finalize: [] };
		this.transactionState = state;
		try {
			const result = operation();
			this.transactionState = null;
			for (const finalize of state.finalize) finalize();
			return result;
		} catch (error) {
			this.transactionState = null;
			const rollbackErrors: unknown[] = [];
			for (const undo of [...state.undo].reverse()) {
				try {
					undo();
				} catch (rollbackError) {
					rollbackErrors.push(rollbackError);
				}
			}
			if (rollbackErrors.length > 0) {
				throw new AggregateError(
					[error, ...rollbackErrors],
					'Ticket mutation failed and could not be fully rolled back',
				);
			}
			throw error;
		}
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
		const parsed = v.safeParse(StatusJsonSchema, raw);
		if (!parsed.success) {
			console.warn(`Malformed status.json in ${dir}:`, parsed.issues);
			return null;
		}
		return parsed.output;
	}

	writeStatusJson(dir: string, status: StatusJson): void {
		this.writeJson(path.join(dir, 'status.json'), status);
	}

	readWorktreeJson(worktreeDir: string, fileName: string): unknown | null {
		const filePath = path.join(worktreeDir, fileName);
		try {
			return this.configRepo.readJson(filePath);
		} catch (err) {
			console.warn(`Failed to read ${filePath}:`, err);
			return null;
		}
	}

	writeWorktreeJson(worktreeDir: string, fileName: string, data: unknown): void {
		this.writeJson(path.join(worktreeDir, fileName), data);
	}

	listEntries(parentDir: string): fs.Dirent[] {
		if (!fs.existsSync(parentDir)) return [];
		return fs.readdirSync(parentDir, { withFileTypes: true });
	}

	createDirectory(dir: string): void {
		const existed = fs.existsSync(dir);
		fs.mkdirSync(dir, { recursive: true });
		if (!existed && this.transactionState) {
			this.transactionState.undo.push(() => fs.rmSync(dir, { recursive: true, force: true }));
		}
	}

	removeDirectory(dir: string): void {
		if (this.transactionState && fs.existsSync(dir)) {
			const stagedPath = path.join(
				path.dirname(dir),
				`.context-launch-transaction-${randomUUID()}`,
			);
			fs.renameSync(dir, stagedPath);
			this.transactionState.undo.push(() => fs.renameSync(stagedPath, dir));
			this.transactionState.finalize.push(() => fs.rmSync(stagedPath, { recursive: true, force: true }));
			return;
		}
		fs.rmSync(dir, { recursive: true, force: true });
	}

	renameDirectory(from: string, to: string): void {
		fs.renameSync(from, to);
		if (this.transactionState) {
			this.transactionState.undo.push(() => fs.renameSync(to, from));
		}
	}

	readFile(filePath: string): Buffer {
		return fs.readFileSync(filePath);
	}

	readFileText(filePath: string): string {
		return fs.readFileSync(filePath, 'utf-8');
	}

	writeFile(filePath: string, content: Buffer | string): void {
		const before = this.captureFile(filePath);
		try {
			fs.writeFileSync(filePath, content);
		} catch (error) {
			this.restoreFile(filePath, before);
			throw error;
		}
		this.recordFileUndo(filePath, before);
	}

	deleteFile(filePath: string): void {
		const before = this.captureFile(filePath);
		fs.unlinkSync(filePath);
		this.recordFileUndo(filePath, before);
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

	private writeJson(filePath: string, data: unknown): void {
		const before = this.captureFile(filePath);
		try {
			this.configRepo.writeJson(filePath, data);
		} catch (error) {
			this.restoreFile(filePath, before);
			throw error;
		}
		this.recordFileUndo(filePath, before);
	}

	private captureFile(filePath: string): Buffer | null {
		return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
	}

	private recordFileUndo(filePath: string, before: Buffer | null): void {
		if (this.transactionState) {
			this.transactionState.undo.push(() => this.restoreFile(filePath, before));
		}
	}

	private restoreFile(filePath: string, before: Buffer | null): void {
		if (before === null) {
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return;
		}
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, before);
	}
}
