import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from './config-paths.js';

export function initializeDataDir(paths: ConfigPaths): void {
	const configDefaultsDir = paths.configDefaults();
	copyIfMissing(path.join(configDefaultsDir, 'config.json'), paths.projectRegistryFile());
	copyIfMissing(path.join(configDefaultsDir, 'launcher-config.json'), paths.appLauncherConfigFile());
	copyIfMissing(path.join(configDefaultsDir, 'boards.json'), paths.boardsFile());
}

function copyIfMissing(src: string, dest: string): void {
	if (fs.existsSync(dest)) return;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(src, dest);
}
