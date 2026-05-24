import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LauncherConfigManager } from './launcher-config.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// cleanup best-effort
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
		const mgr = new LauncherConfigManager(configDir);
		const config = mgr.loadAppConfig();
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Default');
		expect(config.skills).toEqual([]);
	});

	it('loadAppConfig returns defaults when file contains invalid JSON', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		fs.writeFileSync(path.join(configDir, 'launcher-config.json'), 'not json');
		const mgr = new LauncherConfigManager(configDir);
		const config = mgr.loadAppConfig();
		// Falls back to creating default
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Default');
	});

	it('saveAppConfig then loadAppConfig roundtrips correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
		const config = mgr.loadProjectConfig('nonexistent');
		expect(config.templates).toEqual([]);
		expect(config.skills).toEqual([]);
	});

	it('merge: app templates + project templates, project wins on name collision', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['S1'],
		});
		mgr.saveColumnDefaults('slug', 'done', {
			templateName: 'Custom',
			checkedSkills: ['S2', 'S3'],
		});
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']).toEqual({
			templateName: 'Default',
			checkedSkills: ['S1'],
		});
		expect(config.columnDefaults?.['done']).toEqual({
			templateName: 'Custom',
			checkedSkills: ['S2', 'S3'],
		});
	});

	it('columnDefaults save and load', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.saveColumnDefaults('slug', 'todo', {
			templateName: 'Default',
			checkedSkills: ['S1', 'S2'],
		});
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults?.['todo']).toEqual({
			templateName: 'Default',
			checkedSkills: ['S1', 'S2'],
		});
	});

	it('addTemplate to app scope, verify file on disk', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.addTemplate('app', 'any-slug', { name: 'New', text: 'new text' });
		const raw = JSON.parse(fs.readFileSync(path.join(configDir, 'launcher-config.json'), 'utf-8'));
		const found = raw.templates.find((t: { name: string }) => t.name === 'New');
		expect(found).toBeDefined();
		expect(found.text).toBe('new text');
	});

	it('addTemplate with duplicate name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.addTemplate('app', 'slug', { name: 'Dup', text: 'first' });
		expect(() => mgr.addTemplate('app', 'slug', { name: 'Dup', text: 'second' }))
			.toThrow('already exists');
	});

	it('removeTemplate removes from correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.addTemplate('app', 'slug', { name: 'ToRemove', text: 'text' });
		mgr.removeTemplate('app', 'slug', 'ToRemove');
		const config = mgr.loadAppConfig();
		expect(config.templates.find(t => t.name === 'ToRemove')).toBeUndefined();
	});

	it('updateTemplate strips extra properties from the template object', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
		mgr.addSkill('project', 'my-proj', { name: 'NewSkill', text: 'skill text' });
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'tickets', 'my-proj', 'launcher-config.json'), 'utf-8')
		);
		const found = raw.skills.find((s: { name: string }) => s.name === 'NewSkill');
		expect(found).toBeDefined();
		expect(found.text).toBe('skill text');
	});

	it('addSkill with duplicate name throws', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.addSkill('project', 'slug', { name: 'Dup', text: 'first' });
		expect(() => mgr.addSkill('project', 'slug', { name: 'Dup', text: 'second' }))
			.toThrow('already exists');
	});

	it('removeSkill removes from correct scope', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.addSkill('project', 'slug', { name: 'ToRemove', text: 'text' });
		mgr.removeSkill('project', 'slug', 'ToRemove');
		const config = mgr.loadProjectConfig('slug');
		expect(config.skills.find(s => s.name === 'ToRemove')).toBeUndefined();
	});

	it('updateSkill renames correctly', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
		mgr.saveProjectConfig('slug', {
			templates: [],
			skills: [{ name: 'OldSkill', text: 'old' }],
		});
		mgr.updateSkill('project', 'slug', 'OldSkill', { name: 'NewSkill', text: 'new' });
		const config = mgr.loadProjectConfig('slug');
		expect(config.skills.find(s => s.name === 'OldSkill')).toBeUndefined();
		expect(config.skills.find(s => s.name === 'NewSkill')?.text).toBe('new');
	});

	it('merge worktreeRootPath comes from project config', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
		const merged = mgr.getMergedConfig('slug');
		expect(merged.worktreeRootPath).toBeNull();
	});

	it('loadAppConfig on corrupt JSON overwrites file with defaults', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const configPath = path.join(configDir, 'launcher-config.json');
		fs.writeFileSync(configPath, '{{{not valid json!!!');

		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);

		// Write app config with columnDefaults directly on disk
		const appPath = path.join(configDir, 'launcher-config.json');
		fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(appPath, JSON.stringify({
			templates: [{ name: 'Default', text: 'text' }],
			skills: [],
			columnDefaults: {
				todo: { templateName: 'Default', checkedSkills: ['S1'] },
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
		const mgr = new LauncherConfigManager(configDir);
		mgr.saveAppConfig({
			templates: [{ name: 'Keep', text: 'keep text' }],
			skills: [{ name: 'S1', text: 's1' }],
		});
		const before = fs.readFileSync(path.join(configDir, 'launcher-config.json'), 'utf-8');

		// Should not throw
		expect(() => mgr.removeTemplate('app', 'slug', 'DoesNotExist')).not.toThrow();

		// Config file is byte-identical (no unnecessary rewrite side-effects)
		const after = fs.readFileSync(path.join(configDir, 'launcher-config.json'), 'utf-8');
		expect(JSON.parse(after)).toEqual(JSON.parse(before));

		// Templates are intact
		const config = mgr.loadAppConfig();
		expect(config.templates).toHaveLength(1);
		expect(config.templates[0].name).toBe('Keep');
	});

	it('addTemplate with empty string name succeeds, second add throws duplicate', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);
		// Save a config object that has no templates or skills keys
		mgr.saveAppConfig({ worktreeRootPath: '/some/path' } as any);

		// Raw file on disk should have no templates/skills keys
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'launcher-config.json'), 'utf-8')
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

	it('empty slug resolves project config to tickets/ parent dir, not a subdirectory', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);

		const config = {
			templates: [{ name: 'EmptySlug', text: 'empty slug template' }],
			skills: [],
		};
		mgr.saveProjectConfig('', config);

		// The file should land at configDir/tickets/launcher-config.json
		// (parent-level, no slug subdirectory) because path.join collapses the empty segment
		const parentLevelPath = path.join(configDir, 'tickets', 'launcher-config.json');
		expect(fs.existsSync(parentLevelPath)).toBe(true);

		// No subdirectory was created for the empty slug
		const ticketsDir = path.join(configDir, 'tickets');
		const entries = fs.readdirSync(ticketsDir);
		expect(entries).toEqual(['launcher-config.json']); // file only, no subdirectories

		// loadProjectConfig with empty slug reads from the same parent-level path
		const loaded = mgr.loadProjectConfig('');
		expect(loaded.templates[0].name).toBe('EmptySlug');

		// Demonstrate the collision: a real slug's config lives in tickets/<slug>/launcher-config.json
		// but the empty slug's config lives in tickets/launcher-config.json -- same directory
		// that other slugs' subdirectories are created in
		mgr.saveProjectConfig('real-slug', {
			templates: [{ name: 'RealSlug', text: 'real' }],
			skills: [],
		});
		const realSlugPath = path.join(configDir, 'tickets', 'real-slug', 'launcher-config.json');
		expect(fs.existsSync(realSlugPath)).toBe(true);

		// Both configs coexist but the empty slug config sits at the parent level
		// alongside the real-slug directory -- a structural inconsistency
		const entriesAfter = fs.readdirSync(ticketsDir);
		expect(entriesAfter).toContain('launcher-config.json'); // empty slug's file
		expect(entriesAfter).toContain('real-slug'); // real slug's directory
	});

	it('saveColumnDefaults with column="__proto__" does not pollute prototype and persists through roundtrip', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const mgr = new LauncherConfigManager(configDir);

		const defaults = { templateName: 'T1', checkedSkills: ['S1'] };
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
		const mgr = new LauncherConfigManager(configDir);

		// No runtime type guard exists, so non-string values are accepted
		mgr.addTemplate('app', 'slug', { name: 42, text: null } as any);
		mgr.addTemplate('app', 'slug', { name: undefined, text: { nested: true } } as any);
		mgr.addTemplate('app', 'slug', { name: { complex: 'object' }, text: 'valid text' } as any);

		// Read raw JSON from disk to see what was serialized
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'launcher-config.json'), 'utf-8')
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
		const mgr = new LauncherConfigManager(configDir);

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
		const mgr = new LauncherConfigManager(configDir);

		// Save an array instead of the expected { templates, skills } object
		const arrayPayload = [
			{ name: 'T1', text: 'template one' },
			{ name: 'T2', text: 'template two' },
		];
		mgr.saveAppConfig(arrayPayload as any);

		// The raw file on disk should contain a JSON array
		const raw = JSON.parse(
			fs.readFileSync(path.join(configDir, 'launcher-config.json'), 'utf-8')
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
		const mgr = new LauncherConfigManager(configDir);
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
		const mgr = new LauncherConfigManager(configDir);

		const defaults = { templateName: 'MyTemplate', checkedSkills: ['S1', 'S2'] };
		mgr.saveColumnDefaults('slug', '', defaults);

		// Verify it persists through JSON roundtrip at the project config level
		const config = mgr.loadProjectConfig('slug');
		expect(config.columnDefaults).toBeDefined();
		expect(config.columnDefaults?.['']).toEqual(defaults);

		// Verify it is accessible via getMergedConfig
		const merged = mgr.getMergedConfig('slug');
		expect(merged.columnDefaults['']).toEqual(defaults);

		// Verify the raw JSON file on disk has an empty string key
		const rawPath = path.join(configDir, 'tickets', 'slug', 'launcher-config.json');
		const raw = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
		expect(raw.columnDefaults).toHaveProperty('');
		expect(raw.columnDefaults['']).toEqual(defaults);
	});

	it('parseConfig drops unknown top-level keys on load+save roundtrip', () => {
		const configDir = tmpDir('lc-');
		dirs.push(configDir);
		const configPath = path.join(configDir, 'launcher-config.json');
		const original = {
			templates: [{ name: 'T1', text: 't1' }],
			skills: [{ name: 'S1', text: 's1' }],
			notes: 'this is an extra field that should be stripped',
		};
		fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(configPath, JSON.stringify(original, null, 2));

		const mgr = new LauncherConfigManager(configDir);
		const loaded = mgr.loadAppConfig();
		mgr.saveAppConfig(loaded);

		const ondisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		expect(ondisk.notes).toBeUndefined();
		expect(ondisk.templates).toEqual([{ name: 'T1', text: 't1' }]);
		expect(ondisk.skills).toEqual([{ name: 'S1', text: 's1' }]);
	});
});
