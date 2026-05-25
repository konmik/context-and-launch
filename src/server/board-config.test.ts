import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BoardConfigManager, DEFAULT_BOARDS, DEFAULT_BOARD_ID } from './board-config.js';
import { ConfigPaths } from './config-paths.js';

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

	it('first call creates default boards.json', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const boards = manager.listBoards();

		expect(boards).toHaveLength(DEFAULT_BOARDS.length);
		expect(boards[0].id).toBe('kanban');
		expect(boards[1].id).toBe('simple');
		expect(fs.existsSync(path.join(configDir, 'config', 'boards.json'))).toBe(true);
	});

	it('getConfig returns columns for the default board', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig();

		expect(config.columns).toEqual(DEFAULT_BOARDS[0].columns);
	});

	it('getConfig with specific boardId returns that board', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('simple');

		expect(config.columns).toEqual(['todo', 'in-progress', 'done']);
	});

	it('getConfig with unknown boardId falls back to first board', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('nonexistent');

		expect(config.columns).toEqual(DEFAULT_BOARDS[0].columns);
	});

	it('getConfig with null boardId uses default', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig(null);

		expect(config.columns).toEqual(DEFAULT_BOARDS[0].columns);
	});

	it('getBoard returns undefined for unknown id', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		expect(manager.getBoard('nonexistent')).toBeUndefined();
	});

	it('reads back saved boards', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		manager.listBoards(); // creates default

		const manager2 = new BoardConfigManager(new ConfigPaths(configDir));
		const boards = manager2.listBoards();
		expect(boards).toHaveLength(DEFAULT_BOARDS.length);
		expect(boards[0].id).toBe('kanban');
	});

	it('empty array falls back to defaults', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), '[]');

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const boards = manager.listBoards();
		expect(boards).toHaveLength(DEFAULT_BOARDS.length);
	});

	it('malformed JSON falls back to defaults', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), 'not valid json');

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig();
		expect(config.columns).toEqual(DEFAULT_BOARDS[0].columns);
	});

	it('custom boards file is respected', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const custom = [
			{ id: 'dev', name: 'Dev Flow', columns: ['backlog', 'doing', 'review', 'shipped'] },
		];
		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), JSON.stringify(custom));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('dev');
		expect(config.columns).toEqual(['backlog', 'doing', 'review', 'shipped']);
	});
});
