import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from './config-paths.js';

export function initializeDataDir(paths: ConfigPaths): void {
	const configDefaultsDir = paths.configDefaults();
	copyIfMissing(path.join(configDefaultsDir, 'config.json'), paths.projectRegistryFile());
	copyIfMissing(path.join(configDefaultsDir, 'launcher-config.json'), paths.appLauncherConfigFile());
	copyIfMissing(path.join(configDefaultsDir, 'boards.json'), paths.boardsFile());
	copyIfMissing(path.join(configDefaultsDir, 'run-agent.ps1'), path.join(paths.appConfigDir(), 'run-agent.ps1'));
	copyIfMissing(path.join(configDefaultsDir, 'run-agent.sh'), path.join(paths.appConfigDir(), 'run-agent.sh'));
}

function copyIfMissing(src: string, dest: string): void {
	if (fs.existsSync(dest)) return;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(src, dest);
}
