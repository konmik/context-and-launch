import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';

export class ConfigRepository {
	readJson(filePath: string): unknown | null {
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

	writeJson(filePath: string, data: unknown): void {
		const parentDir = path.dirname(filePath);
		fs.mkdirSync(parentDir, { recursive: true });
		const temporaryPath = path.join(
			parentDir,
			`.${path.basename(filePath)}.${randomUUID()}.tmp`,
		);
		let descriptor: number | null = null;
		try {
			fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), { flag: 'wx' });
			descriptor = fs.openSync(temporaryPath, 'r+');
			fs.fsyncSync(descriptor);
			fs.closeSync(descriptor);
			descriptor = null;
			fs.renameSync(temporaryPath, filePath);
		} catch (error) {
			if (descriptor !== null) fs.closeSync(descriptor);
			fs.rmSync(temporaryPath, { force: true });
			throw error;
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
