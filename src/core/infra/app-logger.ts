import fs from 'fs';
import os from 'os';
import path from 'path';

const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_FILES = 10;

class RollingLogger {
	private readonly logDir: string;
	private currentPath: string;
	private currentSize: number;

	constructor(logDir: string) {
		this.logDir = logDir;
		fs.mkdirSync(this.logDir, { recursive: true });
		const files = this.listFiles();
		const last = files.at(-1);
		if (last && this.fileSize(path.join(this.logDir, last)) < MAX_FILE_BYTES) {
			this.currentPath = path.join(this.logDir, last);
			this.currentSize = this.fileSize(this.currentPath);
		} else {
			this.currentPath = this.newFilePath();
			this.currentSize = 0;
		}
	}

	log(category: string, message: string): void {
		const line = `${new Date().toISOString()} [${category}] ${message}\n`;
		const bytes = Buffer.byteLength(line);
		if (this.currentSize + bytes > MAX_FILE_BYTES) {
			this.rotate();
		}
		fs.appendFileSync(this.currentPath, line);
		this.currentSize += bytes;
	}

	readAll(): string {
		return this.listFiles()
			.map(f => fs.readFileSync(path.join(this.logDir, f), 'utf-8'))
			.join('');
	}

	clear(): void {
		for (const f of this.listFiles()) {
			fs.unlinkSync(path.join(this.logDir, f));
		}
		this.currentPath = this.newFilePath();
		this.currentSize = 0;
	}

	private rotate(): void {
		const files = this.listFiles();
		while (files.length >= MAX_FILES) {
			fs.unlinkSync(path.join(this.logDir, files.shift()!));
		}
		this.currentPath = this.newFilePath();
		this.currentSize = 0;
	}

	private listFiles(): string[] {
		try {
			return fs.readdirSync(this.logDir)
				.filter(f => f.startsWith('app-') && f.endsWith('.log'))
				.sort();
		} catch {
			return [];
		}
	}

	private newFilePath(): string {
		return path.join(this.logDir, `app-${Date.now()}.log`);
	}

	private fileSize(filePath: string): number {
		try { return fs.statSync(filePath).size; }
		catch { return 0; }
	}
}

let instance: RollingLogger | undefined;

function getLogger(): RollingLogger {
	if (!instance) {
		const baseDir = process.env.CONTEXT_LAUNCH_DATA_DIR || path.join(os.homedir(), '.context-launch');
		instance = new RollingLogger(path.join(baseDir, 'logs'));
	}
	return instance;
}

type LogListener = (category: string, message: string) => void;
let listener: LogListener | undefined;

export function setAppLogListener(fn: LogListener | undefined): void {
	listener = fn;
}

export function appLog(category: string, message: string): void {
	listener?.(category, message);
	getLogger().log(category, message);
}

export function readAppLogs(): string {
	return getLogger().readAll();
}

export function clearAppLogs(): void {
	getLogger().clear();
}
