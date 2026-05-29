import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from './config-paths.js';
import DEFAULT_LAUNCHER_CONFIG from './defaults/launcher-config.json?raw';
import DEFAULT_BOARDS from './defaults/boards.json?raw';
import { RUN_AGENT_PS1, RUN_AGENT_SH } from '../launcher/platform-scripts.js';

export function initializeDataDir(paths: ConfigPaths): void {
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
