import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { migrateColumnRename } from './column-rename-migration.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ProjectRegistry } from './project-registry.js';
import { BoardConfigManager } from './board-config.js';
import { WorktreeManager } from '../worktree/worktree-manager.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
	}
}

function createTicketDir(worktreeDir: string, folderName: string, status: string) {
	const dir = path.join(worktreeDir, folderName);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({
		number: folderName.split('-')[0].toUpperCase(),
		title: folderName,
		status,
		useWorktree: false,
	}));
}

function makeDeps(configDir: string) {
	const paths = new ConfigPaths(configDir);
	return {
		projectRegistry: new ProjectRegistry(paths),
		launcherConfigManager: new LauncherConfigManager(paths),
		worktreeManager: new WorktreeManager(paths),
		boardConfigManager: new BoardConfigManager(paths),
	};
}

describe('migrateColumnRename', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	function setupProject(configDir: string, projectSlug: string, boardId: string): string {
		const projectPath = path.join(configDir, 'repos', projectSlug);
		fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectPath, { projectSlug, boardId });

		const worktreeDir = path.join(configDir, 'projects', projectSlug, 'tickets');
		fs.mkdirSync(worktreeDir, { recursive: true });

		return worktreeDir;
	}

	it('scope "none" makes no changes', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const result = migrateColumnRename('standard', 'old', 'new', 'none', 'test', makeDeps(configDir));

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('scope "current" updates only current project tickets', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const worktreeDir = setupProject(configDir, 'proj-a', 'standard');
		createTicketDir(worktreeDir, 't-1-alpha', 'todo');
		createTicketDir(worktreeDir, 't-2-bravo', 'todo');
		createTicketDir(worktreeDir, 't-3-charlie', 'done');

		const result = migrateColumnRename('standard', 'todo', 'backlog', 'current', 'proj-a', makeDeps(configDir));

		expect(result.ticketsUpdated).toBe(2);
		expect(result.projectsUpdated).toBe(1);

		const status1 = JSON.parse(fs.readFileSync(path.join(worktreeDir, 't-1-alpha', 'status.json'), 'utf-8'));
		expect(status1.status).toBe('backlog');
		const status3 = JSON.parse(fs.readFileSync(path.join(worktreeDir, 't-3-charlie', 'status.json'), 'utf-8'));
		expect(status3.status).toBe('done');
	});

	it('scope "current" re-keys columnDefaults', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', 'standard');

		const lcm = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = lcm.loadProjectConfig('proj-a');
		config.columnDefaults = {
			'todo': { templateName: 'Default', checkedSkills: [], profileName: null },
		};
		lcm.saveProjectConfig('proj-a', config);

		const deps = makeDeps(configDir);
		migrateColumnRename(
			'standard', 'todo', 'backlog', 'current', 'proj-a',
			{ ...deps, launcherConfigManager: lcm },
		);

		const updated = lcm.loadProjectConfig('proj-a');
		expect(updated.columnDefaults!['backlog']).toBeDefined();
		expect(updated.columnDefaults!['todo']).toBeUndefined();
	});

	it('scope "all" updates all matching projects', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const wtA = setupProject(configDir, 'proj-a', 'standard');
		createTicketDir(wtA, 't-1-alpha', 'todo');

		const wtB = setupProject(configDir, 'proj-b', 'standard');
		createTicketDir(wtB, 't-2-bravo', 'todo');

		setupProject(configDir, 'proj-c', 'simple');

		const result = migrateColumnRename('standard', 'todo', 'backlog', 'all', 'proj-a', makeDeps(configDir));

		expect(result.ticketsUpdated).toBe(2);
		expect(result.projectsUpdated).toBe(2);
	});

	it('no tickets match old status returns zero updates', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const worktreeDir = setupProject(configDir, 'proj-a', 'standard');
		createTicketDir(worktreeDir, 't-1-alpha', 'done');

		const result = migrateColumnRename('standard', 'todo', 'backlog', 'current', 'proj-a', makeDeps(configDir));

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('re-keys columnDefaults even when ticket store throws', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const worktreeDir = setupProject(configDir, 'proj-a', 'standard');

		const lcm = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = lcm.loadProjectConfig('proj-a');
		config.columnDefaults = {
			'todo': { templateName: 'Default', checkedSkills: [], profileName: null },
		};
		lcm.saveProjectConfig('proj-a', config);

		fs.rmSync(worktreeDir, { recursive: true, force: true });
		fs.writeFileSync(worktreeDir, 'not-a-directory');

		const deps = makeDeps(configDir);
		const result = migrateColumnRename('standard', 'todo', 'backlog', 'current', 'proj-a', {
			...deps, launcherConfigManager: lcm,
		});

		const updated = lcm.loadProjectConfig('proj-a');
		expect(updated.columnDefaults!['backlog']).toBeDefined();
		expect(updated.columnDefaults!['todo']).toBeUndefined();
		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(1);
	});

	it('scope "current" with undefined currentProjectSlug silently returns zeroes', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', 'standard');

		const result = migrateColumnRename(
			'standard', 'todo', 'backlog', 'current', undefined as unknown as string, makeDeps(configDir),
		);

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('project with no columnDefaults does not error', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const worktreeDir = setupProject(configDir, 'proj-a', 'standard');
		createTicketDir(worktreeDir, 't-1-alpha', 'todo');

		const result = migrateColumnRename('standard', 'todo', 'backlog', 'current', 'proj-a', makeDeps(configDir));

		expect(result.ticketsUpdated).toBe(1);
		expect(result.projectsUpdated).toBe(1);
	});

	it('scope "all" returns zeroes when listProjects throws', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const brokenRegistry = {
			listProjects() { throw new Error('corrupt projects.json'); },
		} as unknown as ProjectRegistry;

		const deps = makeDeps(configDir);
		const result = migrateColumnRename('standard', 'todo', 'backlog', 'all', '', {
			...deps, projectRegistry: brokenRegistry,
		});

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('scope "all" skips projects with a different boardId', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const wtA = setupProject(configDir, 'proj-a', 'standard');
		createTicketDir(wtA, 't-1-alpha', 'todo');
		const wtB = setupProject(configDir, 'proj-b', 'other');
		createTicketDir(wtB, 't-2-bravo', 'todo');

		const deps = makeDeps(configDir);
		const result = migrateColumnRename('standard', 'todo', 'backlog', 'all', '', deps);

		expect(result.ticketsUpdated).toBe(1);
		expect(result.projectsUpdated).toBe(1);
	});
});
