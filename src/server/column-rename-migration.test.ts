import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { migrateColumnRename } from './column-rename-migration.js';
import { ConfigPaths } from './config-paths.js';
import { LauncherConfigManager } from './launcher-config.js';
import { ProjectRegistry } from './project-registry.js';
import { WorktreeManager } from './worktree-manager.js';

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

describe('migrateColumnRename', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	function setupProject(configDir: string, slug: string, boardId: string): string {
		// Create a fake git repo for worktree
		const projectPath = path.join(configDir, 'repos', slug);
		fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });

		// Register project
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectPath, slug);

		// Create worktree dir (simulated - WorktreeManager.getWorktreeDir reads from paths)
		const worktreeDir = path.join(configDir, 'projects', slug, 'tickets');
		fs.mkdirSync(worktreeDir, { recursive: true });

		// Save launcher config with boardId
		const lcm = new LauncherConfigManager(new ConfigPaths(configDir));
		lcm.saveProjectConfig(slug, {
			templates: [],
			skills: [],
			boardId,
		});

		return worktreeDir;
	}

	it('scope "none" makes no changes', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const result = migrateColumnRename('kanban', 'old', 'new', 'none', 'test', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('scope "current" updates only current project tickets', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const worktreeDir = setupProject(configDir, 'proj-a', 'kanban');
		createTicketDir(worktreeDir, 't-1-alpha', 'todo');
		createTicketDir(worktreeDir, 't-2-bravo', 'todo');
		createTicketDir(worktreeDir, 't-3-charlie', 'done');

		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'current', 'proj-a', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(2);
		expect(result.projectsUpdated).toBe(1);

		// Verify status.json updated
		const status1 = JSON.parse(fs.readFileSync(path.join(worktreeDir, 't-1-alpha', 'status.json'), 'utf-8'));
		expect(status1.status).toBe('backlog');
		const status3 = JSON.parse(fs.readFileSync(path.join(worktreeDir, 't-3-charlie', 'status.json'), 'utf-8'));
		expect(status3.status).toBe('done');
	});

	it('scope "current" re-keys columnDefaults', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const worktreeDir = setupProject(configDir, 'proj-a', 'kanban');

		// Set column defaults for the old column name
		const lcm = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = lcm.loadProjectConfig('proj-a');
		config.columnDefaults = {
			'todo': { templateName: 'Default', checkedSkills: [], profileName: null },
		};
		lcm.saveProjectConfig('proj-a', config);

		migrateColumnRename('kanban', 'todo', 'backlog', 'current', 'proj-a', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: lcm,
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		const updated = lcm.loadProjectConfig('proj-a');
		expect(updated.columnDefaults!['backlog']).toBeDefined();
		expect(updated.columnDefaults!['todo']).toBeUndefined();
	});

	it('scope "all" updates all matching projects', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const wtA = setupProject(configDir, 'proj-a', 'kanban');
		createTicketDir(wtA, 't-1-alpha', 'todo');

		const wtB = setupProject(configDir, 'proj-b', 'kanban');
		createTicketDir(wtB, 't-2-bravo', 'todo');

		// proj-c uses a different board
		setupProject(configDir, 'proj-c', 'simple');

		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'all', 'proj-a', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(2);
		expect(result.projectsUpdated).toBe(2);
	});

	it('no tickets match old status returns zero updates', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const worktreeDir = setupProject(configDir, 'proj-a', 'kanban');
		createTicketDir(worktreeDir, 't-1-alpha', 'done');

		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'current', 'proj-a', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('re-keys columnDefaults even when ticket store throws', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		// Set up the project normally first (so registry and config exist)
		const worktreeDir = setupProject(configDir, 'proj-a', 'kanban');

		// Set column defaults for the old column name
		const lcm = new LauncherConfigManager(new ConfigPaths(configDir));
		const config = lcm.loadProjectConfig('proj-a');
		config.columnDefaults = {
			'todo': { templateName: 'Default', checkedSkills: [], profileName: null },
		};
		lcm.saveProjectConfig('proj-a', config);

		// Corrupt the worktree dir: replace it with a file so readdirSync throws
		fs.rmSync(worktreeDir, { recursive: true, force: true });
		fs.writeFileSync(worktreeDir, 'not-a-directory');

		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'current', 'proj-a', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: lcm,
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		// columnDefaults should be re-keyed even though ticket migration failed
		const updated = lcm.loadProjectConfig('proj-a');
		expect(updated.columnDefaults!['backlog']).toBeDefined();
		expect(updated.columnDefaults!['todo']).toBeUndefined();
		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(1);
	});

	it('scope "current" with undefined currentSlug silently returns zeroes (API route guards this)', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		setupProject(configDir, 'proj-a', 'kanban');

		// When currentSlug is undefined, the migration iterates over [undefined],
		// getWorktreeDir throws, the catch swallows it, and we get {0, 0}.
		// The API route now validates currentSlug before calling migrateColumnRename,
		// returning 400 when scope is "current" and currentSlug is missing.
		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'current', undefined as unknown as string, {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('project with no columnDefaults does not error', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const worktreeDir = setupProject(configDir, 'proj-a', 'kanban');
		createTicketDir(worktreeDir, 't-1-alpha', 'todo');

		// No columnDefaults set
		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'current', 'proj-a', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(1);
		expect(result.projectsUpdated).toBe(1);
	});

	it('scope "all" returns zeroes when listProjects throws', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		const brokenRegistry = {
			listProjects() { throw new Error('corrupt projects.json'); },
		} as unknown as ProjectRegistry;

		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'all', '', {
			projectRegistry: brokenRegistry,
			launcherConfigManager: new LauncherConfigManager(new ConfigPaths(configDir)),
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		expect(result.ticketsUpdated).toBe(0);
		expect(result.projectsUpdated).toBe(0);
	});

	it('scope "all" skips projects whose getMergedConfig throws', () => {
		const configDir = tmpDir('migration-test-');
		dirs.push(configDir);

		// Set up two projects -- proj-a works, proj-b has broken config
		const wtA = setupProject(configDir, 'proj-a', 'kanban');
		createTicketDir(wtA, 't-1-alpha', 'todo');
		setupProject(configDir, 'proj-b', 'kanban');

		const realLcm = new LauncherConfigManager(new ConfigPaths(configDir));
		const brokenLcm = {
			getMergedConfig(slug: string) {
				if (slug === 'proj-b') throw new Error('corrupt config');
				return realLcm.getMergedConfig(slug);
			},
			loadProjectConfig: realLcm.loadProjectConfig.bind(realLcm),
			saveProjectConfig: realLcm.saveProjectConfig.bind(realLcm),
		} as unknown as LauncherConfigManager;

		const result = migrateColumnRename('kanban', 'todo', 'backlog', 'all', '', {
			projectRegistry: new ProjectRegistry(new ConfigPaths(configDir)),
			launcherConfigManager: brokenLcm,
			worktreeManager: new WorktreeManager(new ConfigPaths(configDir)),
		});

		// proj-a should still be migrated, proj-b skipped
		expect(result.ticketsUpdated).toBe(1);
		expect(result.projectsUpdated).toBe(1);
	});
});
