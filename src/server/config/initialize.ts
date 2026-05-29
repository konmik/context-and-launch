import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from './config-paths.js';
import DEFAULT_CONFIG from '../../../config-defaults/config.json?raw';
import DEFAULT_LAUNCHER_CONFIG from '../../../config-defaults/launcher-config.json?raw';
import DEFAULT_BOARDS from '../../../config-defaults/boards.json?raw';
import { RUN_AGENT_PS1, RUN_AGENT_SH } from '../launcher/platform-scripts.js';

export function initializeDataDir(paths: ConfigPaths): void {
	writeIfMissing(paths.projectRegistryFile(), DEFAULT_CONFIG);
	writeIfMissing(paths.appLauncherConfigFile(), DEFAULT_LAUNCHER_CONFIG);
	writeIfMissing(paths.boardsFile(), DEFAULT_BOARDS);
	writeIfMissing(paths.platformScriptPs1(), RUN_AGENT_PS1);
	writeIfMissing(paths.platformScriptSh(), RUN_AGENT_SH);
}

function writeIfMissing(filePath: string, content: string): void {
	if (!fs.existsSync(filePath)) {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content);
	}
}
