import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cascadeReassignBoardId } from './board-delete-cascade.js';
import { BoardConfigManager } from './board-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ProjectRegistry } from './project-registry.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
	}
}

function setupProject(configDir: string, projectSlug: string, boardId: string): void {
	const projectPath = path.join(configDir, 'repos', projectSlug);
	fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });

	const registry = new ProjectRegistry(new ConfigPaths(configDir));
	registry.addProject(projectPath, projectSlug);

	const lcm = new LauncherConfigManager(new ConfigPaths(configDir));
	lcm.saveProjectConfig(projectSlug, {
		templates: [],
		skills: [],
		boardId,
	});
}

describe('cascadeReassignBoardId', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('reassigns boardId on projects referencing the deleted board', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', 'custom-board');
		setupProject(configDir, 'proj-b', 'custom-board');
		setupProject(configDir, 'proj-c', 'other-board');

		const paths = new ConfigPaths(configDir);
		const boardConfigManager = new BoardConfigManager(paths);
		const fallbackBoardId = boardConfigManager.getDefaultBoardId();
		const reassigned = cascadeReassignBoardId('custom-board', {
			projectRegistry: new ProjectRegistry(paths),
			launcherConfigManager: new LauncherConfigManager(paths),
			boardConfigManager,
		});

		expect(reassigned).toBe(2);

		const lcm = new LauncherConfigManager(paths);
		const configA = lcm.loadProjectConfig('proj-a');
		expect(configA.boardId).toBe(fallbackBoardId);

		const configB = lcm.loadProjectConfig('proj-b');
		expect(configB.boardId).toBe(fallbackBoardId);

		const configC = lcm.loadProjectConfig('proj-c');
		expect(configC.boardId).toBe('other-board');
	});

	it('returns 0 when no projects reference the deleted board', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', 'other-board');

		const paths = new ConfigPaths(configDir);
		const reassigned = cascadeReassignBoardId('deleted-board', {
			projectRegistry: new ProjectRegistry(paths),
			launcherConfigManager: new LauncherConfigManager(paths),
			boardConfigManager: new BoardConfigManager(paths),
		});

		expect(reassigned).toBe(0);
	});

	it('returns 0 when there are no projects', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const paths = new ConfigPaths(configDir);
		const reassigned = cascadeReassignBoardId('any-board', {
			projectRegistry: new ProjectRegistry(paths),
			launcherConfigManager: new LauncherConfigManager(paths),
			boardConfigManager: new BoardConfigManager(paths),
		});

		expect(reassigned).toBe(0);
	});

	it('handles projectRegistry.listProjects throwing gracefully', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const paths = new ConfigPaths(configDir);
		const brokenRegistry = {
			listProjects() { throw new Error('corrupt'); },
		} as unknown as ProjectRegistry;

		const reassigned = cascadeReassignBoardId('any-board', {
			projectRegistry: brokenRegistry,
			launcherConfigManager: new LauncherConfigManager(paths),
			boardConfigManager: new BoardConfigManager(paths),
		});

		expect(reassigned).toBe(0);
	});
});
