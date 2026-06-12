import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigRepository } from './config-repository.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch (err) {
			console.warn(`cleanup ${d}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

describe('ConfigRepository', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('readJson returns null for missing file', () => {
		const dir = tmpDir('config-repo-');
		dirs.push(dir);
		const repo = new ConfigRepository();
		expect(repo.readJson(path.join(dir, 'missing.json'))).toBeNull();
	});

	it('readJson parses valid JSON', () => {
		const dir = tmpDir('config-repo-');
		dirs.push(dir);
		const filePath = path.join(dir, 'data.json');
		fs.writeFileSync(filePath, '{"key": "value"}');
		const repo = new ConfigRepository();
		expect(repo.readJson(filePath)).toEqual({ key: 'value' });
	});

	it('readJson throws with file path context on invalid JSON', () => {
		const dir = tmpDir('config-repo-');
		dirs.push(dir);
		const filePath = path.join(dir, 'bad.json');
		fs.writeFileSync(filePath, 'not valid json');
		const repo = new ConfigRepository();
		expect(() => repo.readJson(filePath)).toThrow(filePath);
	});

	it('writeJson creates parent directories and writes formatted JSON', () => {
		const dir = tmpDir('config-repo-');
		dirs.push(dir);
		const filePath = path.join(dir, 'sub', 'dir', 'data.json');
		const repo = new ConfigRepository();
		repo.writeJson(filePath, { key: 'value' });
		const raw = fs.readFileSync(filePath, 'utf-8');
		expect(JSON.parse(raw)).toEqual({ key: 'value' });
		expect(raw).toContain('\n');
	});

	it('readJson then writeJson roundtrips correctly', () => {
		const dir = tmpDir('config-repo-');
		dirs.push(dir);
		const filePath = path.join(dir, 'roundtrip.json');
		const data = { projects: [{ path: '/test', projectSlug: 'test' }], count: 42 };
		const repo = new ConfigRepository();
		repo.writeJson(filePath, data);
		expect(repo.readJson(filePath)).toEqual(data);
	});
});
