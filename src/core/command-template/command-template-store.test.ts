import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { CommandTemplateStore } from './command-template-store.js';

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
		store.save('git.version', 'custom\nscript');
		expect(store.get('git.version')).toMatchObject({ script: 'custom\nscript', isOverridden: true });
		const sparse = JSON.parse(fs.readFileSync(paths.commandTemplateOverridesFile(), 'utf8'));
		expect(sparse).toEqual({ 'git.version': 'custom\nscript' });
		store.save('git.version', defaultScript);
		expect(store.get('git.version').isOverridden).toBe(false);
	});

	it('resets one key while preserving another platform override', () => {
		const { paths, store } = setup();
		store.save('git.version', 'one');
		store.save('picker.files.macos', 'two');
		store.reset('git.version');
		const sparse = JSON.parse(fs.readFileSync(paths.commandTemplateOverridesFile(), 'utf8'));
		expect(sparse).toEqual({ 'picker.files.macos': 'two' });
	});

	it.each([
		['array root', []],
		['non-string value', { 'git.version': 4 }],
		['unknown key', { 'unknown.key': 'x' }],
	])('rejects %s', (_label, value) => {
		const { paths, store } = setup();
		fs.mkdirSync(path.dirname(paths.commandTemplateOverridesFile()), { recursive: true });
		fs.writeFileSync(paths.commandTemplateOverridesFile(), JSON.stringify(value));
		expect(() => store.load()).toThrow();
	});

	it('serves bundled defaults when no override file exists', () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), 'command-template-store-'));
		roots.push(base);
		const paths = new ConfigPaths(base, path.resolve('config-defaults'));
		const store = new CommandTemplateStore(paths, new ConfigRepository());
		expect(fs.existsSync(paths.commandTemplateOverridesFile())).toBe(false);
		const entries = store.load();
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((entry) => !entry.isOverridden)).toBe(true);
		expect(store.get('git.version').script.length).toBeGreaterThan(0);
	});

	it('rejects malformed override JSON', () => {
		const { paths, store } = setup();
		fs.mkdirSync(path.dirname(paths.commandTemplateOverridesFile()), { recursive: true });
		fs.writeFileSync(paths.commandTemplateOverridesFile(), '{');
		expect(() => store.load()).toThrow(/Failed to parse JSON/);
	});
});

describe('CommandTemplateStore placeholder declaration', () => {
	it('rejects a saved script that references an undeclared placeholder', () => {
		const { store } = setup();
		// 'agent-worktree.add-existing' declares worktreePath + branch, not worktreeDir.
		expect(() => store.save(
			'agent-worktree.add-existing', 'git worktree add {{worktreeDir}} {{branch}}',
		)).toThrow(/\{\{worktreeDir\}\}/);
		expect(store.get('agent-worktree.add-existing').isOverridden).toBe(false);
	});

	it('rejects an overrides file that references an undeclared placeholder', () => {
		const { paths, store } = setup();
		fs.mkdirSync(path.dirname(paths.commandTemplateOverridesFile()), { recursive: true });
		fs.writeFileSync(paths.commandTemplateOverridesFile(), JSON.stringify({
			'git.commit': 'git commit -m {{msg}}',
		}));
		expect(() => store.load()).toThrow(/\{\{msg\}\}/);
	});

	it('accepts a saved script that uses only declared placeholders', () => {
		const { store } = setup();
		store.save('agent-worktree.add-existing', 'git worktree add -f {{worktreePath}} {{branch}}');
		expect(store.get('agent-worktree.add-existing').isOverridden).toBe(true);
	});
});
