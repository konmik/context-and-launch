import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LauncherConfigManager, DEFAULT_CONFLICT_RESOLUTION_PROMPT } from './launcher-config.js';
import { ConfigPaths } from './config-paths.js';

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

describe('LauncherConfigManager', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('loadAppConfig returns defaults when file is missing', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = mgr.loadAppConfig();
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Default');
		expect(config.skills).toEqual([]);
	});

	it('loadAppConfig returns defaults when file contains invalid JSON', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		fs.writeFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'not json');
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = mgr.loadAppConfig();
		// Falls back to creating default
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Default');
	});

	it('saveAppConfig then loadAppConfig roundtrips correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = {
			templates: [{ name: 'Custom', text: 'custom text' }],
			skills: [{ name: 'S1', text: 'skill text' }],
		};
		mgr.saveAppConfig(config);
		const loaded = mgr.loadAppConfig();
		expect(loaded.templates).toEqual(config.templates);
		expect(loaded.skills).toEqual(config.skills);
	});

	it('saveProjectConfig then loadProjectConfig roundtrips correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = {
			templates: [{ name: 'Proj', text: 'proj text' }],
			skills: [{ name: 'PS1', text: 'proj skill' }],
		};
		mgr.saveProjectConfig('my-project', config);
		const loaded = mgr.loadProjectConfig('my-project');
		expect(loaded.templates).toEqual(config.templates);
		expect(loaded.skills).toEqual(config.skills);
	});

	it('loadProjectConfig returns empty defaults when file is missing', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = mgr.loadProjectConfig('nonexistent');
		expect(config.templates).toEqual([]);
		expect(config.skills).toEqual([]);
	});

	it('merge: app templates + project templates, project wins on name collision', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [
				{ name: 'Default', text: 'app default' },
				{ name: 'AppOnly', text: 'app only' },
			],
			skills: [],
		});
		mgr.saveProjectConfig('slug', {
			templates: [
				{ name: 'Default', text: 'project default' },
				{ name: 'ProjOnly', text: 'proj only' },
			],
			skills: [],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.templates).toHaveLength(3);

		const defaultT = merged.templates.find(t => t.name === 'Default');
		expect(defaultT?.text).toBe('project default');
		expect(defaultT?.scope).toBe('project');

		const appOnly = merged.templates.find(t => t.name === 'AppOnly');
		expect(appOnly?.scope).toBe('app');

		const projOnly = merged.templates.find(t => t.name === 'ProjOnly');
		expect(projOnly?.scope).toBe('project');
	});

	it('merge: app skills + project skills, project wins on name collision', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [
				{ name: 'Shared', text: 'app version' },
				{ name: 'AppSkill', text: 'app skill' },
			],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [
				{ name: 'Shared', text: 'project version' },
				{ name: 'ProjSkill', text: 'proj skill' },
			],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.skills).toHaveLength(3);

		const shared = merged.skills.find(s => s.name === 'Shared');
		expect(shared?.text).toBe('project version');
		expect(shared?.scope).toBe('project');

		expect(merged.skills.find(s => s.name === 'AppSkill')?.scope).toBe('app');
		expect(merged.skills.find(s => s.name === 'ProjSkill')?.scope).toBe('project');
	});

	it('merge: scope annotations are correct', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [{ name: 'A', text: 'a' }],
			skills: [{ name: 'SA', text: 'sa' }],
		});
		mgr.saveProjectConfig('slug', {
			templates: [{ name: 'P', text: 'p' }],
			skills: [{ name: 'SP', text: 'sp' }],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.templates.find(t => t.name === 'A')?.scope).toBe('app');
		expect(merged.templates.find(t => t.name === 'P')?.scope).toBe('project');
		expect(merged.skills.find(s => s.name === 'SA')?.scope).toBe('app');
		expect(merged.skills.find(s => s.name === 'SP')?.scope).toBe('project');
	});

	it('saveColumnDefaults preserves existing columns', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['S1'],
			profileName: null,
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'Custom',
			checkedSkills: ['S2', 'S3'],
			profileName: null,
		});
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']).toEqual({
			templateName: 'Default',
			checkedSkills: ['S1'],
			profileName: null,
		});
		expect(config.columnDefaults?.['done']).toEqual({
			templateName: 'Custom',
			checkedSkills: ['S2', 'S3'],
			profileName: null,
		});
	});

	it('columnDefaults save and load', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['S1', 'S2'],
			profileName: null,
		});
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']).toEqual({
			templateName: 'Default',
			checkedSkills: ['S1', 'S2'],
			profileName: null,
		});
	});

	it('addTemplate to app scope, verify file on disk', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addTemplate('app', 'any-slug', { name: 'New', text: 'new text' });
		const raw = JSON.parse(fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8'));
		const found = raw.templates.find((t: { name: string }) => t.name === 'New');
		expect(found).toBeDefined();
		expect(found.text).toBe('new text');
	});

	it('addTemplate with duplicate name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addTemplate('app', 'slug', { name: 'Dup', text: 'first' });
		expect(() => mgr.addTemplate('app', 'slug', { name: 'Dup', text: 'second' }))
			.toThrow('already exists');
	});

	it('removeTemplate removes from correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addTemplate('app', 'slug', { name: 'ToRemove', text: 'text' });
		mgr.removeTemplate('app', 'slug', 'ToRemove');
		const config = mgr.loadAppConfig();
		expect(config.templates.find(t => t.name === 'ToRemove')).toBeUndefined();
	});

	it('updateTemplate strips extra properties from the template object', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [{ name: 'Original', text: 'original text' }],
			skills: [],
		});
		// Pass a template with an extra field that is not part of LauncherTemplate
		mgr.updateTemplate('app', 'slug', 'Original', { name: 'Original', text: 'updated', color: 'red' } as any);
		const config = mgr.loadAppConfig();
		const t = config.templates.find(t => t.name === 'Original');
		expect(t).toEqual({ name: 'Original', text: 'updated' });
		expect((t as any).color).toBeUndefined();
	});

	it('updateTemplate renames correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [{ name: 'Old', text: 'old text' }],
			skills: [],
		});
		mgr.updateTemplate('app', 'slug', 'Old', { name: 'New', text: 'new text' });
		const config = mgr.loadAppConfig();
		expect(config.templates.find(t => t.name === 'Old')).toBeUndefined();
		expect(config.templates.find(t => t.name === 'New')?.text).toBe('new text');
	});

	it('addSkill to project scope, verify file on disk', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addSkill('project', 'my-proj', { name: 'NewSkill', text: 'skill text' });
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'projects', 'my-proj', 'config', 'launcher-config.json'), 'utf-8')
		);
		const found = raw.skills.find((s: { name: string }) => s.name === 'NewSkill');
		expect(found).toBeDefined();
		expect(found.text).toBe('skill text');
	});

	it('addSkill with duplicate name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addSkill('project', 'slug', { name: 'Dup', text: 'first' });
		expect(() => mgr.addSkill('project', 'slug', { name: 'Dup', text: 'second' }))
			.toThrow('already exists');
	});

	it('removeSkill removes from correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addSkill('project', 'slug', { name: 'ToRemove', text: 'text' });
		mgr.removeSkill('project', 'slug', 'ToRemove');
		const config = mgr.loadProjectConfig('slug');
		expect(config.skills.find(s => s.name === 'ToRemove')).toBeUndefined();
	});

	it('updateSkill renames correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [{ name: 'OldSkill', text: 'old' }],
		});
		mgr.updateSkill('project', 'slug', 'OldSkill', { name: 'NewSkill', text: 'new' });
		const config = mgr.loadProjectConfig('slug');
		expect(config.skills.find(s => s.name === 'OldSkill')).toBeUndefined();
		expect(config.skills.find(s => s.name === 'NewSkill')?.text).toBe('new');
	});

	it('updateSkill preserves the existing order', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [{ name: 'S1', text: 'old', order: 2.5 }],
		});
		mgr.updateSkill('project', 'slug', 'S1', { name: 'S1', text: 'new' });
		const config = mgr.loadProjectConfig('slug');
		expect(config.skills.find(s => s.name === 'S1')?.order).toBe(2.5);
		expect(config.skills.find(s => s.name === 'S1')?.text).toBe('new');
	});

	it('setSkillOrder sets the order on the named skill in the correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [{ name: 'A', text: 'a' }, { name: 'B', text: 'b' }],
		});
		mgr.setSkillOrder('project', 'slug', 'B', 0.5);
		const config = mgr.loadProjectConfig('slug');
		expect(config.skills.find(s => s.name === 'B')?.order).toBe(0.5);
		expect(config.skills.find(s => s.name === 'A')?.order).toBeUndefined();
	});

	it('setSkillOrder throws for an unknown skill', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', { templates: [], skills: [{ name: 'A', text: 'a' }] });
		expect(() => mgr.setSkillOrder('project', 'slug', 'Nope', 1)).toThrow('not found');
	});

	it('setSkillOrder rejects a non-finite order', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', { templates: [], skills: [{ name: 'A', text: 'a' }] });
		expect(() => mgr.setSkillOrder('project', 'slug', 'A', Infinity)).toThrow('finite number');
		expect(() => mgr.setSkillOrder('project', 'slug', 'A', NaN)).toThrow('finite number');
	});

	it('getMergedConfig sorts skills by order, falling back to canonical index', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		// Canonical order is user-then-project: [UA, UB, P1]. Give UB an explicit
		// order that drops it below P1.
		mgr.saveAppConfig({
			templates: [],
			skills: [{ name: 'UA', text: 'ua' }, { name: 'UB', text: 'ub', order: 5 }],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [{ name: 'P1', text: 'p1' }],
		});
		const merged = mgr.getMergedConfig('slug');
		// UA falls back to index 0, P1 to index 2, UB is explicit 5 -> last.
		expect(merged.skills.map(s => s.name)).toEqual(['UA', 'P1', 'UB']);
		expect(merged.skills.map(s => s.order)).toEqual([0, 2, 5]);
	});

	it('getMergedConfig: a fractional order interleaves user and project skills', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [{ name: 'U1', text: 'u1' }, { name: 'U2', text: 'u2' }],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			// Project skill dragged between the two user skills: midpoint of 0 and 1.
			skills: [{ name: 'P1', text: 'p1', order: 0.5 }],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.skills.map(s => s.name)).toEqual(['U1', 'P1', 'U2']);
	});

	it('merge worktreeRootPath comes from project config', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			worktreeRootPath: 'C:\\worktrees',
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.worktreeRootPath).toBe('C:\\worktrees');
	});

	it('merge worktreeRootPath is null when not configured', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const merged = mgr.getMergedConfig('slug');
		expect(merged.worktreeRootPath).toBeNull();
	});

	it('loadAppConfig on corrupt JSON overwrites file with defaults', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const configPath = path.join(configDir, 'config', 'launcher-config.json');
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		fs.writeFileSync(configPath, '{{{not valid json!!!');

		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = mgr.loadAppConfig();

		// Returned config matches DEFAULT_APP_CONFIG
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Default');
		expect(config.templates[0].text).toContain('{{ticketDir}}');
		expect(config.skills).toEqual([]);

		// Corrupt file on disk was replaced with valid defaults
		const ondisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		expect(ondisk.templates).toHaveLength(1);
		expect(ondisk.templates[0].name).toBe('Default');
		expect(ondisk.skills).toEqual([]);
	});

	it('getMergedConfig ignores app-level columnDefaults', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Write app config with columnDefaults directly on disk
		const appPath = path.join(configDir, 'config', 'launcher-config.json');
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		fs.writeFileSync(appPath, JSON.stringify({
			templates: [{ name: 'Default', text: 'text' }],
			skills: [],
			profiles: [],
			columnDefaults: {
				todo: { templateName: 'Default', checkedSkills: ['S1'], profileName: null },
			},
		}, null, 2));

		// Project has no columnDefaults
		mgr.saveProjectConfig('slug', { templates: [], skills: [] });

		const merged = mgr.getMergedConfig('slug');
		// App-level columnDefaults are invisible to merge; result is empty
		expect(merged.columnDefaults).toEqual({});
	});

	it('removeTemplate with nonexistent name silently succeeds, config unchanged', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [{ name: 'Keep', text: 'keep text' }],
			skills: [{ name: 'S1', text: 's1' }],
			profiles: [],
			shortcuts: [],
		});
		const before = fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8');

		// Should not throw
		expect(() => mgr.removeTemplate('app', 'slug', 'DoesNotExist')).not.toThrow();

		// Config file is byte-identical (no unnecessary rewrite side-effects)
		const after = fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8');
		expect(JSON.parse(after)).toEqual(JSON.parse(before));

		// Templates are intact
		const config = mgr.loadAppConfig();
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Keep');
	});

	it('addTemplate with empty string name succeeds, second add throws duplicate', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		// First add with empty name succeeds -- no empty-name validation exists
		mgr.addTemplate('app', 'slug', { name: '', text: 'empty name template' });
		const config = mgr.loadAppConfig();
		const found = config.templates.find(t => t.name === '');
		expect(found).toBeDefined();
		expect(found?.text).toBe('empty name template');
		// Second add with same empty name throws duplicate error
		expect(() => mgr.addTemplate('app', 'slug', { name: '', text: 'another' }))
			.toThrow('already exists');
	});

	it('saveAppConfig with missing templates/skills writes raw body, loadAppConfig treats missing arrays as empty', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		// Save a config object that has no templates or skills keys
		mgr.saveAppConfig({ worktreeRootPath: '/some/path' } as any);

		// Raw file on disk should have no templates/skills keys
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8')
		);
		expect(raw.templates).toBeUndefined();
		expect(raw.skills).toBeUndefined();
		expect(raw.worktreeRootPath).toBe('/some/path');

		// loadAppConfig parses via parseConfig which defaults missing arrays to []
		const loaded = mgr.loadAppConfig();
		expect(loaded.templates).toEqual([]);
		expect(loaded.skills).toEqual([]);
		expect(loaded.worktreeRootPath).toBe('/some/path');
	});

	it('empty slug resolves project config to projects/config/ dir, not a subdirectory', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		const config = {
			templates: [{ name: 'EmptySlug', text: 'empty slug template' }],
			skills: [],
		};
		mgr.saveProjectConfig('', config);

		// path.join collapses the empty slug segment: projects//config/ -> projects/config/
		// This collides with the app config directory (config/)
		const collapsedPath = path.join(configDir, 'projects', 'config', 'launcher-config.json');
		expect(fs.existsSync(collapsedPath)).toBe(true);

		// loadProjectConfig with empty slug reads from the same collapsed path
		const loaded = mgr.loadProjectConfig('');
		expect(loaded.templates[0].name).toBe('EmptySlug');

		// Demonstrate the collision: a real slug's config lives in projects/<slug>/config/
		// but the empty slug's config collapses into projects/config/
		mgr.saveProjectConfig('real-slug', {
			templates: [{ name: 'RealSlug', text: 'real' }],
			skills: [],
		});
		const realSlugPath = path.join(configDir, 'projects', 'real-slug', 'config', 'launcher-config.json');
		expect(fs.existsSync(realSlugPath)).toBe(true);

		// Both configs coexist under projects/
		const projectsDir = path.join(configDir, 'projects');
		const entriesAfter = fs.readdirSync(projectsDir);
		expect(entriesAfter).toContain('config'); // empty slug's collapsed dir
		expect(entriesAfter).toContain('real-slug'); // real slug's directory
	});

	it('saveColumnDefaults with column="__proto__" does not pollute prototype and persists through roundtrip', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		const defaults = { templateName: 'T1', checkedSkills: ['S1'], profileName: null };
		mgr.saveColumnDefaults('slug', '__proto__', defaults);

		// Verify no prototype pollution on a fresh plain object
		const fresh: Record<string, unknown> = {};
		expect(fresh['templateName']).toBeUndefined();
		expect(fresh['checkedSkills']).toBeUndefined();

		// Load the config back and check whether __proto__ column was persisted
		const config = mgr.loadProjectConfig('slug');
		const stored = config.columnDefaults?.['__proto__'];

		// With bracket assignment on a plain object, obj['__proto__'] = value
		// invokes the __proto__ setter rather than creating an own property,
		// so JSON.stringify drops it and the roundtrip loses the data.
		// This is a bug: the column default silently vanishes.
		expect(stored).toEqual(defaults);
	});

	it('addTemplate with non-string name/text (null, undefined, number, object) passes through and roundtrips via JSON', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// No runtime type guard exists, so non-string values are accepted
		mgr.addTemplate('app', 'slug', { name: 42, text: null } as any);
		mgr.addTemplate('app', 'slug', { name: undefined, text: { nested: true } } as any);
		mgr.addTemplate('app', 'slug', { name: { complex: 'object' }, text: 'valid text' } as any);

		// Read raw JSON from disk to see what was serialized
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8')
		);

		// name: 42, text: null -- both survive JSON serialization
		const rawT42 = raw.templates.find((t: any) => t.name === 42);
		expect(rawT42).toBeDefined();
		expect(rawT42.text).toBeNull();

		// name: undefined becomes missing key in JSON (JSON.stringify omits undefined in object values)
		// The entry exists as an object but the 'name' property is absent
		const rawUndef = raw.templates.find((t: any) => !('name' in t) || t.name === undefined);
		expect(rawUndef).toBeDefined();
		// text: { nested: true } survives as a nested object
		expect(rawUndef.text).toEqual({ nested: true });

		// name: { complex: 'object' } survives as a nested object
		const rawObj = raw.templates.find((t: any) => typeof t.name === 'object' && t.name !== null && t.name.complex === 'object');
		expect(rawObj).toBeDefined();
		expect(rawObj.text).toBe('valid text');

		// Roundtrip: loadAppConfig reads them back through parseConfig
		const reloaded = mgr.loadAppConfig();
		// Default template + 3 non-string entries = 4 total
		expect(reloaded.templates).toHaveLength(4);

		// name: 42 survives JSON roundtrip (number stays number)
		const t42 = reloaded.templates.find(t => (t.name as any) === 42);
		expect(t42).toBeDefined();
		expect(t42!.text).toBeNull();

		// name: undefined -> after JSON roundtrip, key is absent, so name is undefined
		const tUndef = reloaded.templates.find(t => t.name === undefined);
		expect(tUndef).toBeDefined();

		// name: { complex: 'object' } survives as a parsed object
		const tObj = reloaded.templates.find(t => typeof t.name === 'object' && t.name !== null);
		expect(tObj).toBeDefined();
		expect((tObj!.name as any).complex).toBe('object');
	});

	it('addTemplate/addSkill with control characters or 10000-char name: accepted and persisted', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Name with control characters: null byte, tab, newline, carriage return, bell, etc.
		const controlName = 'ctrl\x00\x01\x07\t\n\r\x1b chars';
		mgr.addTemplate('app', 'slug', { name: controlName, text: 'control template' });

		const configAfterCtrl = mgr.loadAppConfig();
		const ctrlTemplate = configAfterCtrl.templates.find(t => t.name === controlName);
		expect(ctrlTemplate).toBeDefined();
		expect(ctrlTemplate!.text).toBe('control template');

		// Extremely long name: 10000 characters
		const longName = 'A'.repeat(10000);
		mgr.addSkill('project', 'slug', { name: longName, text: 'long name skill' });

		const projectConfig = mgr.loadProjectConfig('slug');
		const longSkill = projectConfig.skills.find(s => s.name === longName);
		expect(longSkill).toBeDefined();
		expect(longSkill!.name).toHaveLength(10000);
		expect(longSkill!.text).toBe('long name skill');

		// Verify the long-name skill also appears in merged config
		const merged = mgr.getMergedConfig('slug');
		const mergedSkill = merged.skills.find(s => s.name === longName);
		expect(mergedSkill).toBeDefined();
		expect(mergedSkill!.name).toHaveLength(10000);

		// Duplicate detection still works for control-char name
		expect(() => mgr.addTemplate('app', 'slug', { name: controlName, text: 'dup' }))
			.toThrow('already exists');

		// Duplicate detection still works for long name
		expect(() => mgr.addSkill('project', 'slug', { name: longName, text: 'dup' }))
			.toThrow('already exists');
	});

	it('saveAppConfig with a JSON array (not object) writes array, loadAppConfig returns empty templates/skills', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Save an array instead of the expected { templates, skills } object
		const arrayPayload = [
			{ name: 'T1', text: 'template one' },
			{ name: 'T2', text: 'template two' },
		];
		mgr.saveAppConfig(arrayPayload as any);

		// The raw file on disk should contain a JSON array
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8')
		);
		expect(Array.isArray(raw)).toBe(true);
		expect(raw).toHaveLength(2);
		expect(raw[0]).toEqual({ name: 'T1', text: 'template one' });

		// loadAppConfig -> parseConfig accesses parsed.templates and parsed.skills,
		// which are undefined on an array, so both default to [].
		// columnDefaults and worktreeRootPath are also undefined.
		const loaded = mgr.loadAppConfig();
		expect(loaded.templates).toEqual([]);
		expect(loaded.skills).toEqual([]);
		expect(loaded.columnDefaults).toBeUndefined();
		expect(loaded.worktreeRootPath).toBeUndefined();

		// The original array data is silently lost -- a type-confusion corruption.
		// writeConfigFile accepted the array because JSON.stringify handles arrays,
		// but parseConfig assumes the parsed result is an object with .templates/.skills
		// and silently falls back to empty arrays when those properties are missing.
	});

	it('saveProjectConfig with Windows-reserved device names (CON, NUL, AUX, PRN) as slugs', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const reservedNames = ['CON', 'NUL', 'AUX', 'PRN'];
		const config = {
			templates: [{ name: 'T1', text: 'text' }],
			skills: [],
		};

		for (const slug of reservedNames) {
			// requireSafeSlug does not reject Windows-reserved device names,
			// so saveProjectConfig will attempt to create a directory named e.g. "CON".
			// On Windows, these are reserved device names and fs.mkdirSync may behave
			// unexpectedly -- it might silently succeed (creating an unusable path),
			// or throw an error depending on the Windows version and filesystem.
			//
			// The slug validation should ideally reject these names on Windows.

			// Test: does saveProjectConfig throw or succeed?
			let threw = false;
			let errorMessage = '';
			try {
				mgr.saveProjectConfig(slug, config);
			} catch (e) {
				threw = true;
				errorMessage = e instanceof Error ? e.message : String(e);
			}

			if (threw) {
				// If it threw, that's the filesystem rejecting the reserved name.
				// The slug validator should catch this before it reaches the filesystem.
				expect(errorMessage).toBeTruthy();
			} else {
				// If it didn't throw, verify we can read the config back.
				// On some Windows configurations, the directory might be created
				// but the path may point to a device rather than a real file.
				const loaded = mgr.loadProjectConfig(slug);
				expect(loaded.templates).toEqual(config.templates);
			}
		}
	});

	it('saveColumnDefaults with column="" (empty string) persists through JSON roundtrip and is accessible via getMergedConfig', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		const defaults = { templateName: 'MyTemplate', checkedSkills: ['S1', 'S2'], profileName: null };
		mgr.saveColumnDefaults('slug', '', defaults);

		// Verify it persists through JSON roundtrip at the project config level
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults).toBeDefined();
		expect(config.columnDefaults?.['']).toEqual(defaults);

		// Verify it is accessible via getMergedConfig
		const merged = mgr.getMergedConfig('slug');
		expect(merged.columnDefaults['']).toEqual(defaults);

		// Verify the raw JSON file on disk has an empty string key
		const rawPath = path.join(configDir, 'projects', 'slug', 'config', 'launcher-config.json');
		const raw = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
		expect(raw.columnDefaults).toHaveProperty('');
		expect(raw.columnDefaults['']).toEqual(defaults);
	});

	it('parseConfig drops unknown top-level keys on load+save roundtrip', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const configPath = path.join(configDir, 'config', 'launcher-config.json');
		const original = {
			templates: [{ name: 'T1', text: 't1' }],
			skills: [{ name: 'S1', text: 's1' }],
			notes: 'this is an extra field that should be stripped',
		};
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		fs.writeFileSync(configPath, JSON.stringify(original, null, 2));

		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const loaded = mgr.loadAppConfig();
		mgr.saveAppConfig(loaded);

		const ondisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		expect(ondisk.notes).toBeUndefined();
		expect(ondisk.templates).toEqual([{ name: 'T1', text: 't1' }]);
		expect(ondisk.skills).toEqual([{ name: 'S1', text: 's1' }]);
	});

	it('saveWorktreeRootPath sets the path atomically without clobbering other fields', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveProjectConfig('slug', {
			templates: [{ name: 'T1', text: 'text' }],
			skills: [{ name: 'S1', text: 'skill' }],
			profiles: [],
			columnDefaults: { todo: { templateName: 'T1', checkedSkills: ['S1'], profileName: null } },
		});

		mgr.saveWorktreeRootPath('slug', '/new/path');

		const config = mgr.loadProjectConfig('slug');
		expect(config.worktreeRootPath).toBe('/new/path');
		expect(config.templates).toEqual([{ name: 'T1', text: 'text' }]);
		expect(config.skills).toEqual([{ name: 'S1', text: 'skill' }]);
		expect(config.columnDefaults?.['todo']).toEqual({ templateName: 'T1', checkedSkills: ['S1'], profileName: null });
	});

	it('saveWorktreeRootPath with undefined removes the path', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			worktreeRootPath: '/old/path',
		});

		mgr.saveWorktreeRootPath('slug', undefined);

		const config = mgr.loadProjectConfig('slug');
		expect(config.worktreeRootPath).toBeUndefined();
	});

	it('saveWorktreeRootPath does not lose concurrent addTemplate changes', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveProjectConfig('slug', {
			templates: [{ name: 'Original', text: 'original' }],
			skills: [],
		});

		mgr.addTemplate('project', 'slug', { name: 'NewTemplate', text: 'new' });
		mgr.saveWorktreeRootPath('slug', '/worktrees');

		const config = mgr.loadProjectConfig('slug');
		expect(config.templates).toHaveLength(2);
		expect(config.templates.find(t => t.name === 'NewTemplate')).toBeDefined();
		expect(config.worktreeRootPath).toBe('/worktrees');
	});

	it('saveWorktreeRootPath does not lose concurrent saveColumnDefaults changes', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			profiles: [],
		});

		mgr.saveColumnDefaults('slug', 'todo', { templateName: 'T1', checkedSkills: ['S1'], profileName: null });
		mgr.saveWorktreeRootPath('slug', '/worktrees');

		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']).toEqual({ templateName: 'T1', checkedSkills: ['S1'], profileName: null });
		expect(config.worktreeRootPath).toBe('/worktrees');
	});

	it('simulated old client-side race: GET-modify-PUT overwrites intervening template add', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveProjectConfig('slug', {
			templates: [{ name: 'T1', text: 'original' }],
			skills: [],
		});

		const staleSnapshot = mgr.loadProjectConfig('slug');

		mgr.addTemplate('project', 'slug', { name: 'T2', text: 'added between GET and PUT' });

		mgr.saveProjectConfig('slug', { ...staleSnapshot, worktreeRootPath: '/new' });

		const config = mgr.loadProjectConfig('slug');
		expect(config.worktreeRootPath).toBe('/new');
		// This demonstrates the race: T2 is lost because the stale snapshot didn't have it
		expect(config.templates.find(t => t.name === 'T2')).toBeUndefined();
	});

	it('atomic saveWorktreeRootPath avoids the race demonstrated above', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveProjectConfig('slug', {
			templates: [{ name: 'T1', text: 'original' }],
			skills: [],
		});

		mgr.addTemplate('project', 'slug', { name: 'T2', text: 'concurrent add' });
		mgr.saveWorktreeRootPath('slug', '/new');

		const config = mgr.loadProjectConfig('slug');
		expect(config.worktreeRootPath).toBe('/new');
		expect(config.templates.find(t => t.name === 'T2')).toBeDefined();
	});

	it('saveWorktreeRootPath on nonexistent project creates config with only worktreeRootPath', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.saveWorktreeRootPath('new-project', '/some/path');

		const config = mgr.loadProjectConfig('new-project');
		expect(config.worktreeRootPath).toBe('/some/path');
		expect(config.templates).toEqual([]);
		expect(config.skills).toEqual([]);
	});

	it('loadAppConfig returns defaults with two profiles when file is missing', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = mgr.loadAppConfig();
		expect(config.profiles).toHaveLength(2);
		expect(config.profiles![0].name).toBe('Claude Win');
		expect(config.profiles![0].command).toBe('powershell -File {{appConfigDir}}/run-agent.ps1 {{initialPrompt}} {{windowTitle}}');
		expect(config.profiles![1].name).toBe('Claude macOS');
		expect(config.profiles![1].command).toBe('bash {{appConfigDir}}/run-agent.sh {{initialPrompt}} {{windowTitle}}');
	});

	it('addProfile to app scope, verify file on disk', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addProfile('app', 'any-slug', { name: 'Custom Profile', command: 'my-command --flag' });
		const raw = JSON.parse(fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8'));
		const found = raw.profiles.find((p: { name: string }) => p.name === 'Custom Profile');
		expect(found).toBeDefined();
		expect(found.command).toBe('my-command --flag');
	});

	it('addProfile with duplicate name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addProfile('app', 'slug', { name: 'Dup', command: 'first' });
		expect(() => mgr.addProfile('app', 'slug', { name: 'Dup', command: 'second' }))
			.toThrow('already exists');
	});

	it('removeProfile removes from correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addProfile('app', 'slug', { name: 'ToRemove', command: 'cmd' });
		mgr.removeProfile('app', 'slug', 'ToRemove');
		const config = mgr.loadAppConfig();
		expect((config.profiles ?? []).find(p => p.name === 'ToRemove')).toBeUndefined();
	});

	it('updateProfile renames correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [{ name: 'Old', command: 'old cmd' }],
		});
		mgr.updateProfile('app', 'slug', 'Old', { name: 'New', command: 'new cmd' });
		const config = mgr.loadAppConfig();
		expect((config.profiles ?? []).find(p => p.name === 'Old')).toBeUndefined();
		expect((config.profiles ?? []).find(p => p.name === 'New')?.command).toBe('new cmd');
	});

	it('updateProfile strips extra properties', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [{ name: 'Original', command: 'orig cmd' }],
		});
		mgr.updateProfile('app', 'slug', 'Original', { name: 'Original', command: 'updated', extra: 'junk' } as any);
		const config = mgr.loadAppConfig();
		const p = (config.profiles ?? []).find(p => p.name === 'Original');
		expect(p).toEqual({ name: 'Original', command: 'updated' });
		expect((p as any).extra).toBeUndefined();
	});

	it('merge: app profiles + project profiles, project wins on name collision', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [
				{ name: 'Shared', command: 'app version' },
				{ name: 'AppOnly', command: 'app only' },
			],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			profiles: [
				{ name: 'Shared', command: 'project version' },
				{ name: 'ProjOnly', command: 'proj only' },
			],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.profiles).toHaveLength(3);

		const shared = merged.profiles.find(p => p.name === 'Shared');
		expect(shared?.command).toBe('project version');
		expect(shared?.scope).toBe('project');

		expect(merged.profiles.find(p => p.name === 'AppOnly')?.scope).toBe('app');
		expect(merged.profiles.find(p => p.name === 'ProjOnly')?.scope).toBe('project');
	});

	it('merge: scope annotations are correct for profiles', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [{ name: 'AP', command: 'app' }],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			profiles: [{ name: 'PP', command: 'proj' }],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.profiles.find(p => p.name === 'AP')?.scope).toBe('app');
		expect(merged.profiles.find(p => p.name === 'PP')?.scope).toBe('project');
	});

	it('saveColumnDefaults with profileName persists through roundtrip', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['S1'],
			profileName: 'Claude Win',
		});
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']?.profileName).toBe('Claude Win');
	});

	it('getMergedConfig includes profileName in columnDefaults', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'T1',
			checkedSkills: [],
			profileName: 'Claude macOS',
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.columnDefaults['done']?.profileName).toBe('Claude macOS');
	});

	it('ensurePlatformScripts writes scripts only if missing', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.ensurePlatformScripts();

		const ps1Path = path.join(configDir, 'config', 'run-agent.ps1');
		const shPath = path.join(configDir, 'config', 'run-agent.sh');
		expect(fs.existsSync(ps1Path)).toBe(true);
		expect(fs.existsSync(shPath)).toBe(true);

		// Modify a file
		fs.writeFileSync(ps1Path, 'custom content');

		// Call again -- should not overwrite
		mgr.ensurePlatformScripts();
		expect(fs.readFileSync(ps1Path, 'utf-8')).toBe('custom content');
	});

	it('removeProfile cleans up columnDefaults referencing the deleted profile name', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Add a profile to the project scope
		mgr.addProfile('project', 'slug', { name: 'MyProfile', command: 'my-cmd' });

		// Save column defaults that reference this profile
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['S1'],
			profileName: 'MyProfile',
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'Custom',
			checkedSkills: [],
			profileName: 'MyProfile',
		});
		// A column that references a different profile -- should remain untouched
		mgr.saveColumnDefaults('slug', 'in-progress', {
			templateName: 'Other',
			checkedSkills: ['S2'],
			profileName: 'OtherProfile',
		});

		// Remove the profile
		mgr.removeProfile('project', 'slug', 'MyProfile');

		// Column defaults referencing the deleted profile should have profileName cleared
		const merged = mgr.getMergedConfig('slug');
		expect(merged.columnDefaults['todo']?.profileName).toBeNull();
		expect(merged.columnDefaults['done']?.profileName).toBeNull();
		// The unrelated column default should be untouched
		expect(merged.columnDefaults['in-progress']?.profileName).toBe('OtherProfile');
	});

	it('removeTemplate cleans up columnDefaults referencing the deleted template name', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Add a template to the project scope
		mgr.addTemplate('project', 'slug', { name: 'MyTemplate', text: 'some text' });

		// Save column defaults that reference this template
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'MyTemplate',
			checkedSkills: ['S1'],
			profileName: null,
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'MyTemplate',
			checkedSkills: [],
			profileName: 'SomeProfile',
		});
		// A column that references a different template -- should remain untouched
		mgr.saveColumnDefaults('slug', 'in-progress', {
			templateName: 'OtherTemplate',
			checkedSkills: ['S2'],
			profileName: null,
		});

		// Remove the template
		mgr.removeTemplate('project', 'slug', 'MyTemplate');

		// Column defaults referencing the deleted template should have templateName cleared
		const merged = mgr.getMergedConfig('slug');
		expect(merged.columnDefaults['todo']?.templateName).toBeNull();
		expect(merged.columnDefaults['done']?.templateName).toBeNull();
		// The unrelated column default should be untouched
		expect(merged.columnDefaults['in-progress']?.templateName).toBe('OtherTemplate');
	});

	it('getMergedConfig returns default conflict resolution prompt when not configured', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const merged = mgr.getMergedConfig('slug');
		expect(merged.conflictResolutionPrompt).toContain('merge conflicts');
	});

	it('conflictResolutionPrompt round-trips through save/load', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveConflictResolutionSettings('slug', 'Custom prompt text');
		const config = mgr.loadProjectConfig('slug');
		expect(config.conflictResolutionPrompt).toBe('Custom prompt text');
		const merged = mgr.getMergedConfig('slug');
		expect(merged.conflictResolutionPrompt).toBe('Custom prompt text');
	});

	it('saveConflictResolutionSettings does not clobber other fields', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveProjectConfig('slug', {
			templates: [{ name: 'T1', text: 'text' }],
			skills: [],
			profiles: [],
			worktreeRootPath: '/some/path',
		});
		mgr.saveConflictResolutionSettings('slug', 'My prompt');
		const config = mgr.loadProjectConfig('slug');
		expect(config.templates).toHaveLength(1);
		expect(config.worktreeRootPath).toBe('/some/path');
		expect(config.conflictResolutionPrompt).toBe('My prompt');
	});

	it('non-string conflictResolutionPrompt on disk falls back to default in getMergedConfig', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		// Hand-edited / corrupt project file with a non-string prompt.
		const projPath = path.join(configDir, 'projects', 'slug', 'config', 'launcher-config.json');
		fs.mkdirSync(path.dirname(projPath), { recursive: true });
		fs.writeFileSync(projPath, JSON.stringify({
			templates: [], skills: [], profiles: [], shortcuts: [],
			conflictResolutionPrompt: 12345,
		}));
		const merged = mgr.getMergedConfig('slug');
		// MergedLauncherConfig.conflictResolutionPrompt is typed string; a truthy
		// non-string value must not leak through. It falls back to the default.
		expect(typeof merged.conflictResolutionPrompt).toBe('string');
		expect(merged.conflictResolutionPrompt).toBe(DEFAULT_CONFLICT_RESOLUTION_PROMPT);
	});

	it('empty conflictResolutionPrompt falls back to default in getMergedConfig', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveConflictResolutionSettings('slug', '');
		const merged = mgr.getMergedConfig('slug');
		expect(merged.conflictResolutionPrompt).toContain('merge conflicts');
	});

	it('ensurePlatformScripts creates scripts on first loadAppConfig', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		mgr.loadAppConfig();

		const ps1Path = path.join(configDir, 'config', 'run-agent.ps1');
		const shPath = path.join(configDir, 'config', 'run-agent.sh');
		expect(fs.existsSync(ps1Path)).toBe(true);
		expect(fs.existsSync(shPath)).toBe(true);
	});

	it('addShortcut to app scope, verify file on disk', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addShortcut('app', 'any-slug', { name: 'Open Editor', command: 'code {{projectPath}}' });
		const raw = JSON.parse(fs.readFileSync(path.join(configDir, 'config', 'launcher-config.json'), 'utf-8'));
		const found = raw.shortcuts.find((s: { name: string }) => s.name === 'Open Editor');
		expect(found).toBeDefined();
		expect(found.command).toBe('code {{projectPath}}');
	});

	it('addShortcut to project scope, verify file on disk', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addShortcut('project', 'my-proj', { name: 'Open Folder', command: 'explorer {{ticketDir}}' });
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'projects', 'my-proj', 'config', 'launcher-config.json'), 'utf-8')
		);
		const found = raw.shortcuts.find((s: { name: string }) => s.name === 'Open Folder');
		expect(found).toBeDefined();
		expect(found.command).toBe('explorer {{ticketDir}}');
	});

	it('addShortcut with duplicate name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addShortcut('app', 'slug', { name: 'Dup', command: 'first' });
		expect(() => mgr.addShortcut('app', 'slug', { name: 'Dup', command: 'second' }))
			.toThrow('already exists');
	});

	it('removeShortcut removes from correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.addShortcut('app', 'slug', { name: 'ToRemove', command: 'cmd' });
		mgr.removeShortcut('app', 'slug', 'ToRemove');
		const config = mgr.loadAppConfig();
		expect((config.shortcuts ?? []).find(s => s.name === 'ToRemove')).toBeUndefined();
	});

	it('updateShortcut renames correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [{ name: 'Old', command: 'old cmd' }],
		});
		mgr.updateShortcut('app', 'slug', 'Old', { name: 'New', command: 'new cmd' });
		const config = mgr.loadAppConfig();
		expect((config.shortcuts ?? []).find(s => s.name === 'Old')).toBeUndefined();
		expect((config.shortcuts ?? []).find(s => s.name === 'New')?.command).toBe('new cmd');
	});

	it('updateShortcut strips extra properties', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [{ name: 'Original', command: 'orig cmd' }],
		});
		mgr.updateShortcut('app', 'slug', 'Original', { name: 'Original', command: 'updated', extra: 'junk' } as any);
		const config = mgr.loadAppConfig();
		const s = (config.shortcuts ?? []).find(s => s.name === 'Original');
		expect(s).toEqual({ name: 'Original', command: 'updated' });
		expect((s as any).extra).toBeUndefined();
	});

	it('updateShortcut with nonexistent name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [],
		});
		expect(() => mgr.updateShortcut('app', 'slug', 'Missing', { name: 'Missing', command: 'cmd' }))
			.toThrow('not found');
	});

	it('merge: app shortcuts + project shortcuts, project wins on name collision', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [
				{ name: 'Shared', command: 'app version' },
				{ name: 'AppOnly', command: 'app only' },
			],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [
				{ name: 'Shared', command: 'project version' },
				{ name: 'ProjOnly', command: 'proj only' },
			],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.shortcuts).toHaveLength(3);

		const shared = merged.shortcuts.find(s => s.name === 'Shared');
		expect(shared?.command).toBe('project version');
		expect(shared?.scope).toBe('project');

		expect(merged.shortcuts.find(s => s.name === 'AppOnly')?.scope).toBe('app');
		expect(merged.shortcuts.find(s => s.name === 'ProjOnly')?.scope).toBe('project');
	});

	it('merge: scope annotations are correct for shortcuts', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		mgr.saveAppConfig({
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [{ name: 'AS', command: 'app' }],
		});
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [],
			profiles: [],
			shortcuts: [{ name: 'PS', command: 'proj' }],
		});
		const merged = mgr.getMergedConfig('slug');
		expect(merged.shortcuts.find(s => s.name === 'AS')?.scope).toBe('app');
		expect(merged.shortcuts.find(s => s.name === 'PS')?.scope).toBe('project');
	});

	it('getMergedConfig returns empty shortcuts when neither scope has any', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));
		const merged = mgr.getMergedConfig('slug');
		expect(merged.shortcuts).toEqual([]);
	});

	it('updateTemplate rename updates columnDefaults.templateName', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Add a template and set columnDefaults referencing it
		mgr.addTemplate('project', 'slug', { name: 'old-name', text: 'some text' });
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'old-name',
			checkedSkills: [],
			profileName: null,
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'other-template',
			checkedSkills: [],
			profileName: null,
		});

		// Rename the template
		mgr.updateTemplate('project', 'slug', 'old-name', { name: 'new-name', text: 'some text' });

		// columnDefaults referencing old-name should now reference new-name
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']?.templateName).toBe('new-name');
		// Unrelated column default should be untouched
		expect(config.columnDefaults?.['done']?.templateName).toBe('other-template');
	});

	it('updateSkill rename updates columnDefaults.checkedSkills', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Add a skill and set columnDefaults referencing it
		mgr.addSkill('project', 'slug', { name: 'old-skill', text: 'skill text' });
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: null,
			checkedSkills: ['old-skill', 'other-skill'],
			profileName: null,
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: null,
			checkedSkills: ['other-skill'],
			profileName: null,
		});

		// Rename the skill
		mgr.updateSkill('project', 'slug', 'old-skill', { name: 'new-skill', text: 'skill text' });

		// columnDefaults referencing old-skill should now reference new-skill
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']?.checkedSkills).toEqual(['new-skill', 'other-skill']);
		// Unrelated column default should be untouched
		expect(config.columnDefaults?.['done']?.checkedSkills).toEqual(['other-skill']);
	});

	it('updateProfile rename updates columnDefaults.profileName', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Add a profile and set columnDefaults referencing it
		mgr.addProfile('project', 'slug', { name: 'old-profile', command: 'cmd' });
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: null,
			checkedSkills: [],
			profileName: 'old-profile',
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: null,
			checkedSkills: [],
			profileName: 'other-profile',
		});

		// Rename the profile
		mgr.updateProfile('project', 'slug', 'old-profile', { name: 'new-profile', command: 'cmd' });

		// columnDefaults referencing old-profile should now reference new-profile
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']?.profileName).toBe('new-profile');
		// Unrelated column default should be untouched
		expect(config.columnDefaults?.['done']?.profileName).toBe('other-profile');
	});

	it('removeSkill cleans up columnDefaults.checkedSkills referencing the deleted skill name', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(new ConfigPaths(configDir));

		// Add a skill to the project scope
		mgr.addSkill('project', 'slug', { name: 'MySkill', text: 'skill text' });

		// Save column defaults that reference this skill in checkedSkills
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['MySkill', 'OtherSkill'],
			profileName: null,
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'Custom',
			checkedSkills: ['MySkill'],
			profileName: null,
		});
		// A column that does not reference the skill -- should remain untouched
		mgr.saveColumnDefaults('slug', 'in-progress', {
			templateName: 'Other',
			checkedSkills: ['OtherSkill'],
			profileName: null,
		});

		// Remove the skill
		mgr.removeSkill('project', 'slug', 'MySkill');

		// Column defaults referencing the deleted skill should have it removed from checkedSkills
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']?.checkedSkills).toEqual(['OtherSkill']);
		expect(config.columnDefaults?.['done']?.checkedSkills).toEqual([]);
		// The unrelated column default should be untouched
		expect(config.columnDefaults?.['in-progress']?.checkedSkills).toEqual(['OtherSkill']);
	});

});
