import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { CommandTemplateStore } from './command-template-store.js';
import { createStoredConfig } from '~/util/stored-config.js';
import { succeed } from '~/util/result.js';
import type { CommandTemplateOverrides } from './command-template-types.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function setup() {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), 'command-template-store-'));
	roots.push(base);
	const paths = new ConfigPaths(base, path.resolve('config-defaults'));
	return { paths, store: new CommandTemplateStore(paths, new ConfigRepository()) };
}

describe('CommandTemplateStore', () => {
	it('loads missing overrides and saves only sparse differences', () => {
		const { paths, store } = setup();
		const original = store.get('git.version');
		const defaultScript = original.script;
		expect(original.isOverridden).toBe(false);
		store.write({ ...store.read(), 'git.version': 'custom\nscript' });
		expect(store.get('git.version')).toMatchObject({ script: 'custom\nscript', isOverridden: true });
		const sparse = JSON.parse(fs.readFileSync(paths.commandTemplateOverridesFile(), 'utf8'));
		expect(sparse).toEqual({ 'git.version': 'custom\nscript' });
		store.write({ ...store.read(), 'git.version': defaultScript });
		expect(store.get('git.version').isOverridden).toBe(false);
	});

	it('resets one key while preserving another platform override', () => {
		const { paths, store } = setup();
		store.write({ 'git.version': 'one', 'picker.files.macos': 'two' });
		const { 'git.version': _removed, ...rest } = store.read();
		store.write(rest);
		const sparse = JSON.parse(fs.readFileSync(paths.commandTemplateOverridesFile(), 'utf8'));
		expect(sparse).toEqual({ 'picker.files.macos': 'two' });
	});

	it('transforms the latest file and preserves overrides added since the editor loaded', async () => {
		const { paths, store } = setup();
		expect(store.read()).toEqual({});
		store.write({ 'picker.files.macos': 'external edit' });
		const storage = createStoredConfig<CommandTemplateOverrides>(
			async owner => succeed(store.read(owner)),
			async (json, owner) => succeed(store.write(JSON.parse(json), owner)),
			async owner => store.release(owner));
		expect(await storage.update(current => ({ ...current, 'git.version': 'custom version' })))
			.toEqual(succeed(undefined));
		expect(store.read()).toEqual({ 'picker.files.macos': 'external edit', 'git.version': 'custom version' });
		expect(new CommandTemplateStore(paths, new ConfigRepository()).read()).toEqual(store.read());
		expect(store.get('git.version').script).toBe('custom version');
	});

	it('rejects competing writers and releases a failed write without changing the file', () => {
		const { store } = setup();
		store.write({ 'git.version': 'original' });
		store.read('first');
		expect(() => store.read('second')).toThrow('being updated');
		expect(() => store.write({})).toThrow('being updated');
		expect(() => store.write({}, 'second')).toThrow('missing or expired');
		expect(() => store.write({ 'git.version': '{{undeclared}}' }, 'first')).toThrow('undeclared');
		expect(store.read('second')).toEqual({ 'git.version': 'original' });
		store.release('second');
		store.read('third');
		store.write({}, 'third');
		expect(store.get('git.version').isOverridden).toBe(false);
	});

	it.each([
		['array root', []],
		['non-string value', { 'git.version': 4 }],
		['unknown key', { 'unknown.key': 'x' }],
	])('rejects %s', (_label, value) => {
		const { paths, store } = setup();
		fs.mkdirSync(path.dirname(paths.commandTemplateOverridesFile()), { recursive: true });
		fs.writeFileSync(paths.commandTemplateOverridesFile(), JSON.stringify(value));
		expect(() => store.read()).toThrow();
	});

	it('serves bundled defaults when no override file exists', () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), 'command-template-store-'));
		roots.push(base);
		const paths = new ConfigPaths(base, path.resolve('config-defaults'));
		const store = new CommandTemplateStore(paths, new ConfigRepository());
		expect(fs.existsSync(paths.commandTemplateOverridesFile())).toBe(false);
		expect(store.read()).toEqual({});
		expect(store.get('git.version').isOverridden).toBe(false);
		expect(store.get('git.version').script.length).toBeGreaterThan(0);
	});

	it('rejects malformed override JSON', () => {
		const { paths, store } = setup();
		fs.mkdirSync(path.dirname(paths.commandTemplateOverridesFile()), { recursive: true });
		fs.writeFileSync(paths.commandTemplateOverridesFile(), '{');
		expect(() => store.read()).toThrow(/Failed to parse JSON/);
	});
});

describe('CommandTemplateStore placeholder declaration', () => {
	it('rejects a saved script that references an undeclared placeholder', () => {
		const { store } = setup();
		// 'agent-worktree.add-existing' declares worktreePath + branch, not worktreeDir.
		expect(() => store.write({
			'agent-worktree.add-existing': 'git worktree add {{worktreeDir}} {{branch}}',
		})).toThrow(/\{\{worktreeDir\}\}/);
		expect(store.get('agent-worktree.add-existing').isOverridden).toBe(false);
	});

	it('rejects an overrides file that references an undeclared placeholder', () => {
		const { paths, store } = setup();
		fs.mkdirSync(path.dirname(paths.commandTemplateOverridesFile()), { recursive: true });
		fs.writeFileSync(paths.commandTemplateOverridesFile(), JSON.stringify({
			'git.commit': 'git commit -m {{msg}}',
		}));
		expect(() => store.read()).toThrow(/\{\{msg\}\}/);
	});

	it('accepts a saved script that uses only declared placeholders', () => {
		const { store } = setup();
		store.write({ 'agent-worktree.add-existing': 'git worktree add -f {{worktreePath}} {{branch}}' });
		expect(store.get('agent-worktree.add-existing').isOverridden).toBe(true);
	});
});
