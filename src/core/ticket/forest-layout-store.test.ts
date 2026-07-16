import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ForestLayoutStore } from './forest-layout-store.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
	}
}

describe('ForestLayoutStore', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('read returns empty object when file is missing', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		const store = new ForestLayoutStore(dir);
		expect(store.read()).toEqual({});
	});

	it('read returns empty object for malformed JSON', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), 'not json');
		const store = new ForestLayoutStore(dir);
		expect(store.read()).toEqual({});
	});

	it('read returns empty object for array JSON', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), '[]');
		const store = new ForestLayoutStore(dir);
		expect(store.read()).toEqual({});
	});

	it('read drops invalid entries', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), JSON.stringify({
			'A-1': { x: 10, y: 20 },
			'B-2': 'bad',
			'C-3': { x: 'not number', y: 5 },
			'D-4': { x: 30, y: 40 },
		}));
		const store = new ForestLayoutStore(dir);
		expect(store.read()).toEqual({
			'A-1': { x: 10, y: 20 },
			'D-4': { x: 30, y: 40 },
		});
	});

	it('savePositions merges with existing', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), JSON.stringify({
			'A-1': { x: 10, y: 20 },
		}));
		const store = new ForestLayoutStore(dir);
		store.savePositions({ 'B-2': { x: 30, y: 40 } });
		expect(store.read()).toEqual({
			'A-1': { x: 10, y: 20 },
			'B-2': { x: 30, y: 40 },
		});
	});

	it('savePositions overwrites existing entry', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), JSON.stringify({
			'A-1': { x: 10, y: 20 },
		}));
		const store = new ForestLayoutStore(dir);
		store.savePositions({ 'A-1': { x: 99, y: 99 } });
		expect(store.read()).toEqual({ 'A-1': { x: 99, y: 99 } });
	});

	it('renameTicket moves entry', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), JSON.stringify({
			'A-1': { x: 10, y: 20 },
			'B-2': { x: 30, y: 40 },
		}));
		const store = new ForestLayoutStore(dir);
		store.renameTicket('A-1', 'A-99');
		const layout = store.read();
		expect(layout['A-99']).toEqual({ x: 10, y: 20 });
		expect(layout['A-1']).toBeUndefined();
		expect(layout['B-2']).toEqual({ x: 30, y: 40 });
	});

	it('renameTicket is no-op when entry not present', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		const store = new ForestLayoutStore(dir);
		store.renameTicket('X-1', 'X-2');
		expect(store.read()).toEqual({});
	});

	it('removeTicket deletes entry', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		fs.writeFileSync(path.join(dir, 'forest-layout.json'), JSON.stringify({
			'A-1': { x: 10, y: 20 },
			'B-2': { x: 30, y: 40 },
		}));
		const store = new ForestLayoutStore(dir);
		store.removeTicket('A-1');
		expect(store.read()).toEqual({ 'B-2': { x: 30, y: 40 } });
	});

	it('removeTicket is no-op when entry not present', () => {
		const dir = tmpDir('fls-');
		dirs.push(dir);
		const store = new ForestLayoutStore(dir);
		store.removeTicket('X-1');
		expect(store.read()).toEqual({});
	});
});
