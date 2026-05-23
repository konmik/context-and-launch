import { spawn, execSync, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AiEvent, AiStatusResponse } from '../types.js';

interface ActiveRun {
	process: ChildProcess;
	sessionId: string;
	folderName: string;
	slug: string;
	eventBuffer: AiEvent[];
	startedAt: number;
}

export class SessionManager {
	private runsDir: string;
	private activeRuns = new Map<string, ActiveRun>();
	private subscribers = new Map<string, Set<(event: AiEvent) => void>>();
	private nextSeq = 1;

	constructor(configDir?: string) {
		const base = configDir ?? path.join(os.homedir(), '.ai-stages');
		this.runsDir = path.join(base, 'runs');
	}

	private key(slug: string, folderName: string): string {
		return `${slug}/${folderName}`;
	}

	private emit(run: ActiveRun | null, slug: string, folderName: string, type: string, data: unknown): void {
		const event: AiEvent = { timestamp: Date.now(), seq: this.nextSeq++, type, data };
		if (run) {
			event.sessionId = run.sessionId;
			run.eventBuffer.push(event);
		}
		console.log(`[SessionManager] emit seq=${event.seq} type=${type} key=${slug}/${folderName}`);
		this.appendToHistory(slug, folderName, event);
		this.notify(slug, folderName, event);
	}

	startOrResume(
		projectPath: string,
		slug: string,
		folderName: string,
		worktreeDir: string,
		sessionId: string | null,
		ticketNumber?: string,
		message?: string
	): { sessionId: string } {
		const key = this.key(slug, folderName);

		const existing = this.activeRuns.get(key);
		if (existing && existing.process.exitCode === null) {
			return { sessionId: existing.sessionId };
		}

		const isResume = sessionId !== null;
		const finalSessionId = sessionId ?? crypto.randomUUID();

		const args: string[] = [
			'--print', '--verbose',
			'--output-format', 'stream-json',
			'--dangerously-skip-permissions',
		];

		if (isResume) {
			args.push('--resume', finalSessionId);
			if (message) {
				args.push(message);
			}
		} else {
			if (ticketNumber) {
				args.push('-n', ticketNumber);
			}
			args.push('--session-id', finalSessionId);
			const ticketDir = path.resolve(path.join(worktreeDir, folderName));
			let initialPrompt = `Current ticket files are in ${ticketDir}. Read the files there for context.`;
			if (message) {
				initialPrompt = message + '\n' + initialPrompt;
			}
			args.push(initialPrompt);
		}

		console.log(`[SessionManager] spawning claude in ${projectPath} with args:`, args);

		let proc: ChildProcess;
		try {
			proc = spawn('claude', args, {
				cwd: projectPath,
				stdio: ['pipe', 'pipe', 'pipe'],
			});
		} catch (e) {
			this.emit(null, slug, folderName, 'error', {
				message: `Failed to spawn claude: ${e instanceof Error ? e.message : String(e)}`,
			});
			throw e;
		}

		const history = this.getHistory(slug, folderName);
		for (const event of history) {
			if (event.seq == null) {
				event.seq = this.nextSeq++;
			} else if (event.seq >= this.nextSeq) {
				this.nextSeq = event.seq + 1;
			}
		}

		const run: ActiveRun = {
			process: proc,
			sessionId: finalSessionId,
			folderName,
			slug,
			eventBuffer: [...history],
			startedAt: Date.now(),
		};

		this.activeRuns.set(key, run);

		if (message) {
			this.emit(run, slug, folderName, 'user_prompt', { text: message });
		}

		console.log(`[SessionManager] process spawned pid=${proc.pid} stdout=${!!proc.stdout} stderr=${!!proc.stderr} stdin=${!!proc.stdin}`);

		if (proc.stdout) {
			const rl = createInterface({ input: proc.stdout });
			rl.on('line', (line) => {
				console.log(`[SessionManager] stdout line (${line.length} chars):`, line.slice(0, 200));
				if (!line.trim()) return;
				try {
					const parsed = JSON.parse(line);
					this.emit(run, slug, folderName, parsed.type ?? 'unknown', parsed);
				} catch {
					this.emit(run, slug, folderName, 'raw', { text: line });
				}
			});
		} else {
			console.log(`[SessionManager] WARNING: no stdout pipe`);
		}

		if (proc.stderr) {
			const rl = createInterface({ input: proc.stderr });
			rl.on('line', (line) => {
				console.log(`[SessionManager] stderr:`, line.slice(0, 200));
				if (!line.trim()) return;
				this.emit(run, slug, folderName, 'error', { message: line });
			});
		}

		proc.on('exit', (code) => {
			console.log(`[SessionManager] process exited code=${code} key=${key}`);
			this.emit(run, slug, folderName, 'process_exit', { code });
			if (this.activeRuns.get(key) === run) {
				this.activeRuns.delete(key);
			}
		});

		proc.on('error', (err) => {
			console.log(`[SessionManager] process error: ${err.message}`);
			this.emit(run, slug, folderName, 'error', { message: err.message });
			if (this.activeRuns.get(key) === run) {
				this.activeRuns.delete(key);
			}
		});

		if (proc.stdin) {
			proc.stdin.end();
		}

		return { sessionId: finalSessionId };
	}

	stop(slug: string, folderName: string): void {
		const key = this.key(slug, folderName);
		const run = this.activeRuns.get(key);
		if (!run) return;

		const pid = run.process.pid;
		if (pid) {
			try {
				if (process.platform === 'win32') {
					execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
				} else {
					process.kill(-pid, 'SIGKILL');
				}
			} catch {
				try {
					run.process.kill('SIGKILL');
				} catch {
					// swallow
				}
			}
		}

		this.activeRuns.delete(key);
	}

	getStatus(slug: string, folderName: string): AiStatusResponse {
		const run = this.activeRuns.get(this.key(slug, folderName));
		return {
			running: run ? run.process.exitCode === null : false,
			sessionId: run?.sessionId ?? null,
		};
	}

	getEventBuffer(slug: string, folderName: string): AiEvent[] {
		const run = this.activeRuns.get(this.key(slug, folderName));
		return run ? [...run.eventBuffer] : [];
	}

	clearHistory(slug: string, folderName: string): void {
		const file = this.historyFilePath(slug, folderName);
		if (fs.existsSync(file)) {
			fs.unlinkSync(file);
		}
	}

	getHistory(slug: string, folderName: string): AiEvent[] {
		const file = this.historyFilePath(slug, folderName);
		if (!fs.existsSync(file)) return [];
		try {
			const text = fs.readFileSync(file, 'utf-8');
			return JSON.parse(text) as AiEvent[];
		} catch {
			return [];
		}
	}

	isRunning(slug: string, folderName: string): boolean {
		const run = this.activeRuns.get(this.key(slug, folderName));
		return run ? run.process.exitCode === null : false;
	}

	getRunningFolderNames(slug: string): string[] {
		const result: string[] = [];
		for (const [, run] of this.activeRuns) {
			if (run.slug === slug && run.process.exitCode === null) {
				result.push(run.folderName);
			}
		}
		return result;
	}

	subscribe(slug: string, folderName: string, callback: (event: AiEvent) => void): () => void {
		const k = this.key(slug, folderName);
		if (!this.subscribers.has(k)) {
			this.subscribers.set(k, new Set());
		}
		this.subscribers.get(k)!.add(callback);
		return () => {
			this.subscribers.get(k)?.delete(callback);
		};
	}

	private notify(slug: string, folderName: string, event: AiEvent): void {
		const k = this.key(slug, folderName);
		const subs = this.subscribers.get(k);
		console.log(`[SessionManager] notify key=${k} subscribers=${subs?.size ?? 0}`);
		if (subs) {
			for (const cb of subs) {
				try { cb(event); } catch { /* swallow */ }
			}
		}
	}

	private historyFilePath(slug: string, folderName: string): string {
		return path.join(this.runsDir, slug, `${folderName}.json`);
	}

	private appendToHistory(slug: string, folderName: string, event: AiEvent): void {
		const file = this.historyFilePath(slug, folderName);
		const dir = path.dirname(file);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		let events: AiEvent[] = [];
		if (fs.existsSync(file)) {
			try {
				events = JSON.parse(fs.readFileSync(file, 'utf-8')) as AiEvent[];
			} catch {
				events = [];
			}
		}
		events.push(event);
		fs.writeFileSync(file, JSON.stringify(events, null, 2));
	}

	private writeHistory(slug: string, folderName: string, events: AiEvent[]): void {
		const file = this.historyFilePath(slug, folderName);
		const dir = path.dirname(file);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(file, JSON.stringify(events, null, 2));
	}
}
