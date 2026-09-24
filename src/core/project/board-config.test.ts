import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BoardConfigManager } from './board-config.js';
import { validateColumnName, type BoardDefinition } from './board-config-data.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';
import { transformConfig } from '~/util/transform-config.js';
import { succeed } from '~/util/result.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function setup() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-config-'));
	dirs.push(dir);
	const paths = new ConfigPaths(dir);
	initializeDataDir(paths);
	return { paths, store: new BoardConfigManager(paths) };
}

describe('board configuration storage', () => {
	it('selects the configured board and falls back to the first for absent or unknown ids', () => {
		const { store } = setup();
		const boards = store.read();
		expect(store.getConfig('simple').columns).toEqual(boards[1].columns);
		for (const id of [undefined, null, 'missing']) expect(store.getConfig(id).columns).toEqual(boards[0].columns);
	});

	it('preserves unknown board and column fields through a locked transform', async () => {
		const { store, paths } = setup();
		const original = [{ id: 'custom', name: 'Custom', extra: { keep: true }, columns: [
			{ name: 'todo', color: '#0969da', extra: 42 },
		] }];
		fs.writeFileSync(paths.boardsFile(), JSON.stringify(original));
		const result = await transformConfig<BoardDefinition[]>(
			current => current.map(board => ({ ...board, name: 'Renamed' })),
			async owner => succeed(store.read(owner)),
			async (json, owner) => succeed(store.write(JSON.parse(json), owner)),
			async owner => store.release(owner));
		expect(result.type).toBe('Success');
		expect(new BoardConfigManager(paths).read()).toEqual([{ ...original[0], name: 'Renamed' }]);
	});

	it('rejects concurrent and expired writers without overwriting data', () => {
		const { store } = setup();
		const original = store.read('first');
		expect(() => store.read('second')).toThrow('being updated');
		expect(() => store.write(original)).toThrow('being updated');
		expect(() => store.write(original, 'second')).toThrow('missing or expired');
		store.release('first');
		store.read('second');
		expect(() => store.write(original, 'first')).toThrow('missing or expired');
		store.write(original, 'second');
		expect(store.read()).toEqual(original);
	});

	it('releases the lock after failed transforms and rejects invalid writes without changing disk', async () => {
		const { store, paths } = setup();
		const before = fs.readFileSync(paths.boardsFile(), 'utf8');
		await expect(transformConfig(() => { throw new Error('bad edit'); },
			async owner => succeed(store.read(owner)),
			async (json, owner) => succeed(store.write(JSON.parse(json), owner)),
			async owner => store.release(owner))).resolves.toEqual({ type: 'Failure', error: 'bad edit' });
		const boards = store.read('next');
		expect(() => store.write([], 'next')).toThrow('empty');
		expect(() => store.write([...boards, boards[0]])).toThrow('already exists');
		expect(() => store.write([{ ...boards[0], columns: [{ name: 'todo', color: '#123456' }] }])).toThrow('palette');
		expect(fs.readFileSync(paths.boardsFile(), 'utf8')).toBe(before);
	});

	it('reports missing, malformed, and empty files', () => {
		const { store, paths } = setup();
		for (const raw of ['not json', '[]', '{}']) {
			fs.writeFileSync(paths.boardsFile(), raw);
			expect(() => store.read()).toThrow();
		}
		fs.unlinkSync(paths.boardsFile());
		expect(() => store.read()).toThrow('not found');
	});
});

it('slugifies column names and rejects reserved, empty, and duplicate names', () => {
	expect(validateColumnName('In Progress', [])).toBe('in-progress');
	expect(validateColumnName('todo', ['todo'], 'todo')).toBe('todo');
	for (const name of ['', '!!!', 'Undefined', 'In Progress']) {
		expect(() => validateColumnName(name, ['in-progress'])).toThrow();
	}
});
