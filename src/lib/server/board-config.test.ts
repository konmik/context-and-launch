import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BoardConfigManager, DEFAULT_COLUMNS } from './board-config.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
}

describe('BoardConfigManager', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('first call creates default config file', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(configDir);
		const config = manager.getConfig();

		expect(config.columns).toEqual(DEFAULT_COLUMNS);
		expect(fs.existsSync(path.join(configDir, 'board-config', 'kanban.json'))).toBe(true);
	});

	it('reads back saved config', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(configDir);
		manager.getConfig(); // creates default

		const manager2 = new BoardConfigManager(configDir);
		const config = manager2.getConfig();
		expect(config.columns).toEqual(DEFAULT_COLUMNS);
	});

	it('malformed JSON falls back to defaults', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const boardConfigDir = path.join(configDir, 'board-config');
		fs.mkdirSync(boardConfigDir, { recursive: true });
		fs.writeFileSync(path.join(boardConfigDir, 'kanban.json'), 'not valid json');

		const manager = new BoardConfigManager(configDir);
		const config = manager.getConfig();
		expect(config.columns).toEqual(DEFAULT_COLUMNS);
	});
});
