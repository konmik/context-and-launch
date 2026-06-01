import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
	BoardConfigManager, slugifyColumnName, validateColumnName,
} from './board-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';

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

	it('throws when boards.json is missing', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		expect(() => manager.listBoards()).toThrow('not found');
	});

	it('getConfig returns columns for the default board', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig();

		expect(config.columns).toEqual([
			{ name: 'todo', description: 'wishlist' },
			{ name: 'plan', description: '/grill-me' },
			{ name: 'in-progress', description: '/hero' },
			{ name: 'review', description: 'interactive' },
			{ name: 'done', description: '/merge' },
		]);
	});

	it('getConfig with specific boardId returns that board', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('simple');

		expect(config.columns).toEqual([
			{ name: 'todo' }, { name: 'in-progress' }, { name: 'done' },
		]);
	});

	it('getConfig with unknown boardId falls back to first board', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('nonexistent');

		expect(config.columns).toEqual([
			{ name: 'todo', description: 'wishlist' },
			{ name: 'plan', description: '/grill-me' },
			{ name: 'in-progress', description: '/hero' },
			{ name: 'review', description: 'interactive' },
			{ name: 'done', description: '/merge' },
		]);
	});

	it('getConfig with null boardId uses default', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig(null);

		expect(config.columns).toEqual([
			{ name: 'todo', description: 'wishlist' },
			{ name: 'plan', description: '/grill-me' },
			{ name: 'in-progress', description: '/hero' },
			{ name: 'review', description: 'interactive' },
			{ name: 'done', description: '/merge' },
		]);
	});

	it('getBoard returns undefined for unknown id', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		expect(manager.getBoard('nonexistent')).toBeUndefined();
	});

	it('reads back saved boards', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		manager.listBoards();

		const manager2 = new BoardConfigManager(new ConfigPaths(configDir));
		const boards = manager2.listBoards();
		expect(boards).toHaveLength(2);
		expect(boards[0].id).toBe('standard');
	});

	it('empty array throws', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), '[]');
		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		expect(() => manager.listBoards()).toThrow('empty or not an array');
	});

	it('malformed JSON throws', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);
		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), 'not valid json');
		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		expect(() => manager.getConfig()).toThrow();
	});

	it('custom boards file is respected', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const custom = [
			{ id: 'dev', name: 'Dev Flow', columns: [
				{ name: 'backlog' }, { name: 'doing' }, { name: 'review' }, { name: 'shipped' },
			]},
		];
		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), JSON.stringify(custom));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('dev');
		expect(config.columns).toEqual([
			{ name: 'backlog' }, { name: 'doing' }, { name: 'review' }, { name: 'shipped' },
		]);
	});

	it('migrates legacy string[] columns to ColumnDefinition[]', () => {
		const configDir = tmpDir('board-config-test-');
		dirs.push(configDir);

		const legacy = [
			{ id: 'old', name: 'Old Board', columns: ['todo', 'done'] },
		];
		const configSubdir = path.join(configDir, 'config');
		fs.mkdirSync(configSubdir, { recursive: true });
		fs.writeFileSync(path.join(configSubdir, 'boards.json'), JSON.stringify(legacy));

		const manager = new BoardConfigManager(new ConfigPaths(configDir));
		const config = manager.getConfig('old');
		expect(config.columns).toEqual([{ name: 'todo' }, { name: 'done' }]);
	});
});

describe('slugifyColumnName', () => {
	it('lowercases and replaces spaces with hyphens', () => {
		expect(slugifyColumnName('In Progress')).toBe('in-progress');
	});

	it('strips unsafe characters', () => {
		expect(slugifyColumnName('test/col\\name')).toBe('testcolname');
	});

	it('collapses multiple hyphens', () => {
		expect(slugifyColumnName('a---b')).toBe('a-b');
	});

	it('trims leading/trailing hyphens', () => {
		expect(slugifyColumnName('-hello-')).toBe('hello');
	});

	it('returns empty for all special chars', () => {
		expect(slugifyColumnName('!!!')).toBe('');
	});
});

describe('validateColumnName', () => {
	it('rejects empty result', () => {
		expect(() => validateColumnName('!!!', [])).toThrow('must not be empty');
	});

	it('rejects "undefined"', () => {
		expect(() => validateColumnName('undefined', [])).toThrow('reserved');
	});

	it('rejects duplicates', () => {
		expect(() => validateColumnName('todo', ['todo'])).toThrow('already exists');
	});

	it('allows same name in rename mode', () => {
		expect(validateColumnName('todo', ['todo', 'done'], 'todo')).toBe('todo');
	});

	it('returns slugified name', () => {
		expect(validateColumnName('In Progress', [])).toBe('in-progress');
	});

	it('rejects collision after slugification', () => {
		expect(() => validateColumnName('In Progress', ['in-progress'])).toThrow('already exists');
	});
});

describe('BoardConfigManager CRUD', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	function createManager(): BoardConfigManager {
		const configDir = tmpDir('board-crud-test-');
		dirs.push(configDir);
		const paths = new ConfigPaths(configDir);
		initializeDataDir(paths);
		return new BoardConfigManager(paths);
	}

	describe('createBoard', () => {
		it('creates a board', () => {
			const mgr = createManager();
			const board = mgr.createBoard('My Board');
			expect(board.id).toBe('my-board');
			expect(board.name).toBe('My Board');
			expect(board.columns).toEqual([]);
			expect(mgr.getBoard('my-board')).toBeDefined();
		});

		it('rejects duplicate id', () => {
			const mgr = createManager();
			mgr.createBoard('Test');
			expect(() => mgr.createBoard('Test')).toThrow('already exists');
		});

		it('rejects empty name', () => {
			const mgr = createManager();
			expect(() => mgr.createBoard('!!!')).toThrow('must not be empty');
		});

		it('rejects name that slugifies to "undefined"', () => {
			const mgr = createManager();
			expect(() => mgr.createBoard('Undefined')).toThrow('reserved');
		});
	});

	describe('deleteBoard', () => {
		it('deletes a board', () => {
			const mgr = createManager();
			mgr.createBoard('Extra');
			expect(mgr.listBoards().length).toBe(3);
			mgr.deleteBoard('extra');
			expect(mgr.listBoards().length).toBe(2);
		});

		it('rejects deleting the last board', () => {
			const mgr = createManager();
			mgr.deleteBoard('simple');
			expect(() => mgr.deleteBoard('standard')).toThrow('Cannot delete the last board');
		});

		it('throws for nonexistent board', () => {
			const mgr = createManager();
			expect(() => mgr.deleteBoard('nope')).toThrow('Board not found');
		});
	});

	describe('renameBoard', () => {
		it('renames a board', () => {
			const mgr = createManager();
			mgr.renameBoard('standard', 'Agile Board');
			expect(mgr.getBoard('standard')!.name).toBe('Agile Board');
		});

		it('throws for nonexistent board', () => {
			const mgr = createManager();
			expect(() => mgr.renameBoard('nope', 'X')).toThrow('Board not found');
		});
	});

	describe('addColumn', () => {
		it('adds a column with name and description', () => {
			const mgr = createManager();
			const col = mgr.addColumn('standard', 'Blocked', 'Stuck tickets');
			expect(col.name).toBe('blocked');
			expect(col.description).toBe('Stuck tickets');
			const board = mgr.getBoard('standard')!;
			expect(board.columns.find(c => c.name === 'blocked')).toBeDefined();
		});

		it('slugifies the column name', () => {
			const mgr = createManager();
			const col = mgr.addColumn('standard', 'Quality Check');
			expect(col.name).toBe('quality-check');
		});

		it('rejects duplicate name', () => {
			const mgr = createManager();
			expect(() => mgr.addColumn('standard', 'todo')).toThrow('already exists');
		});

		it('rejects empty name', () => {
			const mgr = createManager();
			expect(() => mgr.addColumn('standard', '!!!')).toThrow('must not be empty');
		});

		it('rejects "undefined" name', () => {
			const mgr = createManager();
			expect(() => mgr.addColumn('standard', 'undefined')).toThrow('reserved');
		});

		it('rejects collision after slugification', () => {
			const mgr = createManager();
			expect(() => mgr.addColumn('standard', 'In Progress')).toThrow('already exists');
		});
	});

	describe('removeColumn', () => {
		it('removes a column', () => {
			const mgr = createManager();
			const before = mgr.getBoard('standard')!.columns.length;
			mgr.removeColumn('standard', 'plan');
			expect(mgr.getBoard('standard')!.columns.length).toBe(before - 1);
		});

		it('throws for nonexistent column', () => {
			const mgr = createManager();
			expect(() => mgr.removeColumn('standard', 'nope')).toThrow('Column not found');
		});
	});

	describe('updateColumn', () => {
		it('updates description', () => {
			const mgr = createManager();
			mgr.updateColumn('standard', 'todo', { description: 'Work items' });
			const col = mgr.getBoard('standard')!.columns.find(c => c.name === 'todo')!;
			expect(col.description).toBe('Work items');
		});

		it('clears description with empty string', () => {
			const mgr = createManager();
			mgr.updateColumn('standard', 'todo', { description: 'Something' });
			mgr.updateColumn('standard', 'todo', { description: '' });
			const col = mgr.getBoard('standard')!.columns.find(c => c.name === 'todo')!;
			expect(col.description).toBeUndefined();
		});
	});

	describe('renameColumn', () => {
		it('renames a column', () => {
			const mgr = createManager();
			const result = mgr.renameColumn('standard', 'plan', 'spec');
			expect(result.oldName).toBe('plan');
			expect(result.newName).toBe('spec');
			expect(mgr.getBoard('standard')!.columns.find(c => c.name === 'spec')).toBeDefined();
			expect(mgr.getBoard('standard')!.columns.find(c => c.name === 'plan')).toBeUndefined();
		});

		it('rejects duplicate name', () => {
			const mgr = createManager();
			expect(() => mgr.renameColumn('standard', 'plan', 'todo')).toThrow('already exists');
		});

		it('throws for nonexistent column', () => {
			const mgr = createManager();
			expect(() => mgr.renameColumn('standard', 'nope', 'x')).toThrow('Column not found');
		});
	});

	describe('reorderColumns', () => {
		it('reorders columns', () => {
			const mgr = createManager();
			const originalNames = mgr.getBoard('simple')!.columns.map(c => c.name);
			const reversed = [...originalNames].reverse();
			mgr.reorderColumns('simple', reversed);
			const reordered = mgr.getBoard('simple')!.columns.map(c => c.name);
			expect(reordered).toEqual(reversed);
		});

		it('rejects mismatched names', () => {
			const mgr = createManager();
			expect(() => mgr.reorderColumns('simple', ['todo', 'nope'])).toThrow('must match');
		});
	});
});
