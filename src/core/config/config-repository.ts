import fs from 'fs';
import path from 'path';

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
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
