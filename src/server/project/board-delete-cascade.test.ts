import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cascadeClearBoardId } from './board-delete-cascade.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';
import { ProjectRegistry } from './project-registry.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
	}
}

function setupProject(configDir: string, projectSlug: string, boardId: string | undefined): void {
	const projectPath = path.join(configDir, 'repos', projectSlug);
	fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });

	const registry = new ProjectRegistry(new ConfigPaths(configDir));
	registry.addProject(projectPath, { projectSlug, boardId });
}

describe('cascadeClearBoardId', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('clears boardId from projects referencing the deleted board', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', 'custom-board');
		setupProject(configDir, 'proj-b', 'custom-board');
		setupProject(configDir, 'proj-c', 'other-board');

		const paths = new ConfigPaths(configDir);
		const registry = new ProjectRegistry(paths);
		const cleared = cascadeClearBoardId('custom-board', {
			projectRegistry: registry,
		});

		expect(cleared).toBe(2);

		const projects = registry.listProjects();
		const projA = projects.find(p => p.projectSlug === 'proj-a');
		expect(projA?.boardId).toBeUndefined();

		const projB = projects.find(p => p.projectSlug === 'proj-b');
		expect(projB?.boardId).toBeUndefined();

		const projC = projects.find(p => p.projectSlug === 'proj-c');
		expect(projC?.boardId).toBe('other-board');
	});

	it('returns 0 when no projects reference the deleted board', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', 'other-board');

		const paths = new ConfigPaths(configDir);
		const cleared = cascadeClearBoardId('deleted-board', {
			projectRegistry: new ProjectRegistry(paths),
		});

		expect(cleared).toBe(0);
	});

	it('returns 0 when there are no projects', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const paths = new ConfigPaths(configDir);
		const cleared = cascadeClearBoardId('any-board', {
			projectRegistry: new ProjectRegistry(paths),
		});

		expect(cleared).toBe(0);
	});

	it('skips projects with undefined boardId', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		setupProject(configDir, 'proj-a', undefined);

		const paths = new ConfigPaths(configDir);
		const cleared = cascadeClearBoardId('some-board', {
			projectRegistry: new ProjectRegistry(paths),
		});

		expect(cleared).toBe(0);
	});

	it('handles projectRegistry.listProjects throwing gracefully', () => {
		const configDir = tmpDir('cascade-test-');
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));

		const brokenRegistry = {
			listProjects() { throw new Error('corrupt'); },
		} as unknown as ProjectRegistry;

		const cleared = cascadeClearBoardId('any-board', {
			projectRegistry: brokenRegistry,
		});

		expect(cleared).toBe(0);
	});
});
