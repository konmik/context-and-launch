import type { BoardConfig } from '../types.js';
import type { ConfigPaths } from './config-paths.js';

export const DEFAULT_COLUMNS = ['todo', 'prd', 'in-progress', 'review', 'done'];

export class BoardConfigManager {
	private paths: ConfigPaths;

	constructor(paths: ConfigPaths) {
		this.paths = paths;
	}

	getConfig(): BoardConfig {
		const configFile = this.paths.boardConfigFile();
		const text = this.paths.readConfigFile(configFile);
		if (text === null) {
			const defaultConfig: BoardConfig = { columns: [...DEFAULT_COLUMNS] };
			this.paths.writeConfigFile(configFile, JSON.stringify(defaultConfig, null, 2));
			return defaultConfig;
		}
		try {
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
