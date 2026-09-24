import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, removeTempDir } from '../../test-temp.js';
import {
	LauncherConfigManager, mergeLauncherConfigs,
	type LauncherConfig,
} from './launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';
import { createStoredConfig } from '~/util/stored-config.js';
import { succeed } from '~/util/result.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(removeTempDir)); });

function setup() {
	const directory = makeTempDir('launcher-config-');
	directories.push(directory);
	const paths = new ConfigPaths(directory);
	return { paths, manager: new LauncherConfigManager(paths) };
}

describe('LauncherConfigManager', () => {
	it('reports missing and corrupt app configuration', () => {
		const { paths, manager } = setup();
		expect(() => manager.loadAppConfig()).toThrow('not found');
		fs.mkdirSync(paths.appConfigDir(), { recursive: true });
		fs.writeFileSync(paths.appLauncherConfigFile(), 'not json');
		expect(() => manager.loadAppConfig()).toThrow();
	});

	it('loads defaults for a missing project and decodes a settings-only file', () => {
		const { paths, manager } = setup();
		expect(manager.loadProjectConfig('project')).toMatchObject({ templates: [], skills: [] });
		const file = paths.projectLauncherConfigFile('project');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, JSON.stringify({ worktreeRootPath: '/worktrees' }));
		expect(manager.loadProjectConfig('project')).toMatchObject({
			templates: [], skills: [], profiles: [], shortcuts: [], worktreeRootPath: '/worktrees',
		});
	});

	it('preserves unknown fields through app and project persistence', () => {
		const { manager } = setup();
		const config = {
			templates: [{ name: 'Template', text: 'text', custom: true }], skills: [], notes: 'user data',
		};
		manager.saveAppConfig(config);
		manager.saveProjectConfig('project', manager.loadAppConfig());
		expect(manager.loadProjectConfig('project')).toMatchObject(config);
	});

	it('merges persisted app and project data with project precedence', () => {
		const { manager } = setup();
		manager.saveAppConfig({
			templates: [{ name: 'shared', text: 'app' }], skills: [{ name: 'app', text: 'skill' }],
			profiles: [{ name: 'shared', command: 'app' }], shortcuts: [{ name: 'shared', command: 'app' }],
		});
		manager.saveProjectConfig('project', {
			templates: [{ name: 'shared', text: 'project' }], skills: [{ name: 'project', text: 'skill', order: -1 }],
			profiles: [{ name: 'shared', command: 'project' }], shortcuts: [{ name: 'shared', command: 'project' }],
		});
		const merged = manager.getMergedConfig('project');
		expect(merged.templates).toEqual([{ name: 'shared', text: 'project', scope: 'project', order: 0 }]);
		expect(merged.profiles).toEqual([{ name: 'shared', command: 'project', scope: 'project', order: 0 }]);
		expect(merged.shortcuts).toEqual([{ name: 'shared', command: 'project', scope: 'project', order: 0 }]);
		expect(merged.skills.map(item => [item.name, item.scope])).toEqual([['project', 'project'], ['app', 'app']]);
	});

	it('coordinates project writes with client transforms without locking other projects', () => {
		const { manager } = setup();
		const current = manager.loadProjectConfig('project', 'owner');
		expect(() => manager.loadProjectConfig('project', 'other')).toThrow('being updated');
		expect(() => manager.updateProjectConfig('project', config => ({ ...config, branchPrefix: 'blocked' })))
			.toThrow('being updated');
		manager.updateProjectConfig('another', config => ({ ...config, branchPrefix: 'independent' }));
		manager.saveProjectConfig('project', { ...current, profiles: [{ name: 'saved', command: 'cmd' }] }, 'owner');
		manager.updateProjectConfig('project', config => ({ ...config, branchPrefix: 'saved' }));
		expect(manager.loadProjectConfig('project')).toMatchObject({
			profiles: [{ name: 'saved', command: 'cmd' }], branchPrefix: 'saved',
		});
	});

	it('transforms the latest file and releases the project lock after invalid data or a failed write', async () => {
		const { paths, manager } = setup();
		const file = paths.projectLauncherConfigFile('project');
		manager.saveProjectConfig('project', { templates: [], skills: [], branchPrefix: 'before/' });
		const stale = manager.loadProjectConfig('project');
		fs.writeFileSync(file, JSON.stringify({ ...stale, branchPrefix: 'external/', extra: 'preserved' }));
		const { update } = createStoredConfig<LauncherConfig>(
			async owner => succeed(manager.loadProjectConfig('project', owner)),
			async (json, owner) => succeed(manager.saveProjectConfig('project', JSON.parse(json), owner)),
			async owner => manager.releaseProjectConfig('project', owner));
		expect((await update(current => ({ ...current, conflictResolutionPrompt: 'saved' }))).type).toBe('Success');
		expect(manager.loadProjectConfig('project')).toMatchObject({ branchPrefix: 'external/', extra: 'preserved' });
		// SAFETY: deliberately malformed external data exercises the runtime decoder and lock cleanup.
		const invalid = await update(current => ({ ...current, profiles: [{ name: 'invalid' } as never] }));
		expect(invalid.type).toBe('Failure');
		expect((await update(current => {
			fs.unlinkSync(file);
			fs.mkdirSync(file);
			return { ...current, branchPrefix: 'fails/' };
		})).type).toBe('Failure');
		fs.rmdirSync(file);
		expect((await update(current => ({ ...current, branchPrefix: 'recovered/' }))).type).toBe('Success');
		expect(manager.loadProjectConfig('project').branchPrefix).toBe('recovered/');
	});

	it.each(['todo', '', '__proto__'])('preserves column %j and other columns across partial updates', column => {
		const { manager } = setup();
		const defaults = { templateName: 'T', checkedSkills: ['S'], profileName: 'P', editedPrompt: 'edited' };
		manager.updateProjectConfig('project', current => ({
			...current, columnDefaults: { other: defaults, [column]: defaults },
		}));
		manager.updateProjectConfig('project', current => ({
			...current, columnDefaults: { ...current.columnDefaults, [column]: { ...defaults, editedPrompt: '' } },
		}));
		expect(manager.loadProjectConfig('project').columnDefaults?.[column])
			.toEqual({ ...defaults, editedPrompt: '' });
		manager.updateProjectConfig('project', current => ({
			...current,
			columnDefaults: { ...current.columnDefaults, [column]: { ...defaults, editedPrompt: undefined } },
		}));
		const saved = manager.loadProjectConfig('project').columnDefaults;
		expect(saved?.[column]).toEqual({ templateName: 'T', checkedSkills: ['S'], profileName: 'P' });
		expect(saved?.other).toEqual(defaults);
	});

	it('patches project settings without losing items or column defaults', () => {
		const { manager } = setup();
		manager.saveProjectConfig('project', { templates: [{ name: 'T', text: 'text' }], skills: [] });
		manager.updateProjectConfig('project', current => ({
			...current, columnDefaults: { todo: { templateName: 'T', checkedSkills: [], profileName: null } },
			worktreeRootPath: '/worktrees', branchPrefix: 'feature/', conflictResolutionPrompt: 'resolve',
		}));
		expect(manager.loadProjectConfig('project')).toMatchObject({
			templates: [{ name: 'T', text: 'text' }], columnDefaults: { todo: { templateName: 'T' } },
			worktreeRootPath: '/worktrees', branchPrefix: 'feature/', conflictResolutionPrompt: 'resolve',
		});
		manager.updateProjectConfig('project', current => ({ ...current, worktreeRootPath: undefined }));
		expect(manager.loadProjectConfig('project').worktreeRootPath).toBeUndefined();
	});

	it('initializes built-in profiles, shortcuts, and the conflict prompt', () => {
		const { paths, manager } = setup();
		initializeDataDir(paths);
		const config = manager.getMergedConfig('project');
		expect(config.profiles.map(item => item.name)).toEqual(['Claude Windows', 'Claude macOS', 'Claude Herdr']);
		expect(config.profiles[0].command).toContain('powershell -File {{configDefaultsDir}}/run-agent.ps1');
		expect(config.profiles[1].command).toContain('bash {{configDefaultsDir}}/run-agent.sh');
		expect(config.profiles[2].command).toContain('{{agentDisplayName}} {{herdrWorkspaceLabel}} {{herdrPaneLabel}}');
		expect(config.profiles[2].command).not.toContain('{{markerPath}}');
		expect(config.shortcuts.map(item => item.name)).toEqual(['VS Code', 'WebStorm Windows', 'WebStorm macOS']);
		expect(config.conflictResolutionPrompt).toContain('git rebase --continue');
	});
});

describe('mergeLauncherConfigs', () => {
	it('sorts each collection by explicit order then its merged index', () => {
		const merged = mergeLauncherConfigs({
			templates: [{ name: 'late', text: '', order: 5 }, { name: 'early', text: '' }],
			skills: [{ name: 'early', text: '' }, { name: 'late', text: '', order: 5 }],
			profiles: [{ name: 'late', command: '', order: 5 }, { name: 'early', command: '' }],
			shortcuts: [{ name: 'late', command: '', order: 5 }, { name: 'early', command: '' }],
		}, {
			templates: [{ name: 'middle', text: '' }], skills: [{ name: 'middle', text: '', order: 0.5 }],
			profiles: [{ name: 'middle', command: '' }], shortcuts: [{ name: 'middle', command: '' }],
		});
		for (const items of [merged.templates, merged.skills, merged.profiles, merged.shortcuts]) {
			expect(items.map(item => item.name)).toEqual(['early', 'middle', 'late']);
		}
	});

	it('inherits only the conflict prompt, not column defaults or worktree settings', () => {
		const app: LauncherConfig = {
			templates: [], skills: [], conflictResolutionPrompt: 'app', worktreeRootPath: '/app', branchPrefix: 'app/',
			columnDefaults: { todo: { templateName: 'T', checkedSkills: [], profileName: null } },
		};
		const project: LauncherConfig = { templates: [], skills: [], conflictResolutionPrompt: '' };
		expect(mergeLauncherConfigs(app, project)).toMatchObject({
			columnDefaults: {}, worktreeRootPath: null, branchPrefix: undefined, conflictResolutionPrompt: 'app',
		});
		expect(mergeLauncherConfigs(app, {
			...project, conflictResolutionPrompt: 'project', worktreeRootPath: '/project', branchPrefix: 'project/',
		})).toMatchObject({
			conflictResolutionPrompt: 'project', worktreeRootPath: '/project', branchPrefix: 'project/',
		});
	});
});
