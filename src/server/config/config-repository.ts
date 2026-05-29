import fs from 'fs';
import path from 'path';

export class ConfigRepository {
	readJson(filePath: string): unknown | null {
		if (!fs.existsSync(filePath)) return null;
		try {
			return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		} catch (err) {
			console.warn(`Failed to parse JSON from ${filePath}:`, err);
			return null;
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
