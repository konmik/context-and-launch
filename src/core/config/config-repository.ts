import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import type { JsonValue } from '../shared/json.js';

// Windows refuses to rename over a file while any other handle holds it, which
// a watcher or a scanner does for a few milliseconds after every write. The
// condition clears on its own, so back off briefly before letting the caller
// see the error. Only the rename retries: the wait blocks the thread the server
// answers every request on, so it is spent where the failure was actually seen.
const CONTENTION_RETRY_BUDGET_MS = 1500;
const CONTENTION_RETRY_MAX_DELAY_MS = 25;
const CONTENTION_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function sleepSync(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export class ConfigRepository {
	readJson(filePath: string): JsonValue | null {
		if (!fs.existsSync(filePath)) return null;
		const text = fs.readFileSync(filePath, 'utf-8');
		try {
			return JSON.parse(text);
		} catch (err) {
			throw new Error(
				`Failed to parse JSON from ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	writeJson<Data extends object>(filePath: string, data: Data): void {
		const parentDir = path.dirname(filePath);
		fs.mkdirSync(parentDir, { recursive: true });
		const payload = JSON.stringify(data, null, 2);
		const deadline = Date.now() + CONTENTION_RETRY_BUDGET_MS;
		let delay = 1;
		for (;;) {
			// Each attempt uses a fresh temporary file. When a scanner is holding the
			// one just written, waiting on that same handle is the one thing that
			// cannot help; a new name is often free immediately.
			const temporaryPath = path.join(
				parentDir,
				`.${path.basename(filePath)}.${randomUUID()}.tmp`,
			);
			let descriptor: number | null = null;
			try {
				fs.writeFileSync(temporaryPath, payload, { flag: 'wx' });
				descriptor = fs.openSync(temporaryPath, 'r+');
				fs.fsyncSync(descriptor);
				fs.closeSync(descriptor);
				descriptor = null;
				fs.renameSync(temporaryPath, filePath);
				return;
			} catch (error) {
				if (descriptor !== null) fs.closeSync(descriptor);
				fs.rmSync(temporaryPath, { force: true });
				// SAFETY: node:fs reports failures as an ErrnoException; anything
				// without a contention code is rethrown untouched.
				const code = (error as NodeJS.ErrnoException).code;
				if (
					code === undefined
					|| !CONTENTION_CODES.has(code)
					|| Date.now() >= deadline
				) throw error;
				sleepSync(delay);
				delay = Math.min(delay * 2, CONTENTION_RETRY_MAX_DELAY_MS);
			}
		}
	}

	exists(filePath: string): boolean {
		return fs.existsSync(filePath);
	}

	ensureDir(dirPath: string): void {
		fs.mkdirSync(dirPath, { recursive: true });
	}

	realpathSync(filePath: string): string {
		return fs.realpathSync(filePath);
	}
}
