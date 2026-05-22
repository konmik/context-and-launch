import fs from 'fs';
import path from 'path';
import os from 'os';
import type { BoardConfig } from '../types.js';

export const DEFAULT_COLUMNS = ['todo', 'prd', 'in-progress', 'review', 'done'];

export class BoardConfigManager {
	private boardConfigDir: string;
	private configFile: string;

	constructor(configDir?: string) {
		const base = configDir ?? path.join(os.homedir(), '.ai-stages');
		this.boardConfigDir = path.join(base, 'board-config');
		this.configFile = path.join(this.boardConfigDir, 'kanban.json');
	}

	getConfig(): BoardConfig {
		if (!fs.existsSync(this.configFile)) {
			fs.mkdirSync(this.boardConfigDir, { recursive: true });
			const defaultConfig: BoardConfig = { columns: [...DEFAULT_COLUMNS] };
			fs.writeFileSync(this.configFile, JSON.stringify(defaultConfig, null, 2));
			return defaultConfig;
		}
		try {
			const text = fs.readFileSync(this.configFile, 'utf-8');
			const config = JSON.parse(text) as BoardConfig;
			if (!Array.isArray(config.columns) || config.columns.length === 0) {
				return { columns: [...DEFAULT_COLUMNS] };
			}
			return config;
		} catch {
			return { columns: [...DEFAULT_COLUMNS] };
		}
	}
}
