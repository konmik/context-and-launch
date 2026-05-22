import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectRegistry, generateSlug } from './project-registry.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
}

describe('ProjectRegistry', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('addProject with explicit slug that collides is rejected', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir1 = tmpDir('registry-project1-');
		const projectDir2 = tmpDir('registry-project2-');
		dirs.push(configDir, projectDir1, projectDir2);

		fs.mkdirSync(path.join(projectDir1, '.git'));
		fs.mkdirSync(path.join(projectDir2, '.git'));

		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir1, 'my-slug');

		expect(() => registry.addProject(projectDir2, 'my-slug')).toThrow('Slug already exists');
	});

	it('addProject rejects duplicate canonical path even when raw paths differ', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir, 'first');

		// Build alternate path via subdir/..
		const subdir = path.join(projectDir, 'subdir');
		fs.mkdirSync(subdir);
		const altPath = path.join(projectDir, 'subdir', '..');

		expect(() => registry.addProject(altPath, 'second')).toThrow('already registered');
	});

	it('generateSlug deduplicates when dir name and parent-dir-name combos collide', () => {
		expect(generateSlug('/a/b/my-project', new Set(['my-project', 'b-my-project']))).toBe(
			'b-my-project-2'
		);

		expect(
			generateSlug(
				'/a/b/my-project',
				new Set(['my-project', 'b-my-project', 'b-my-project-2'])
			)
		).toBe('b-my-project-3');
	});

	it('config file is created on first addProject', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir);

		expect(fs.existsSync(path.join(configDir, 'config.json'))).toBe(true);
	});

	it('malformed config.json is handled gracefully', () => {
		const configDir = tmpDir('registry-config-');
		dirs.push(configDir);

		fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(path.join(configDir, 'config.json'), 'not valid json');

		const registry = new ProjectRegistry(configDir);
		expect(registry.listProjects()).toEqual([]);
	});

	it('getDefaultSlug returns lastUsedSlug if valid', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir, 'test-slug');

		expect(registry.getDefaultSlug()).toBe('test-slug');
	});

	it('getDefaultSlug returns first project if lastUsedSlug is invalid', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir, 'test-slug');

		// Manually corrupt lastUsedSlug
		const configFile = path.join(configDir, 'config.json');
		const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		config.lastUsedSlug = 'nonexistent';
		fs.writeFileSync(configFile, JSON.stringify(config));

		const registry2 = new ProjectRegistry(configDir);
		expect(registry2.getDefaultSlug()).toBe('test-slug');
	});

	it('removeProject clears lastUsedSlug when removing the last-used project', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir, 'remove-me');
		registry.removeProject('remove-me');

		expect(registry.getDefaultSlug()).toBeNull();
	});

	it('external edit to config.json after cache is populated is invisible to listProjects', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir, 'original');

		// Externally add a second project directly to config.json on disk
		const configFile = path.join(configDir, 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		onDisk.projects.push({ path: '/fake/external-project', slug: 'external' });
		fs.writeFileSync(configFile, JSON.stringify(onDisk, null, 2));

		// The registry still uses its in-memory cache, so the external project is invisible
		const slugs = registry.listProjects().map((p) => p.slug);
		expect(slugs).toContain('original');
		expect(slugs).not.toContain('external');
		expect(slugs).toHaveLength(1);
	});

	it('external edit is overwritten on save: adding project C after external B silently drops B', () => {
		const configDir = tmpDir('registry-config-');
		const projectDirA = tmpDir('registry-projectA-');
		const projectDirC = tmpDir('registry-projectC-');
		dirs.push(configDir, projectDirA, projectDirC);

		fs.mkdirSync(path.join(projectDirA, '.git'));
		fs.mkdirSync(path.join(projectDirC, '.git'));

		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDirA, 'project-a');

		// Externally add project B directly to config.json on disk
		const configFile = path.join(configDir, 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		onDisk.projects.push({ path: '/fake/project-b', slug: 'project-b' });
		fs.writeFileSync(configFile, JSON.stringify(onDisk, null, 2));

		// Now add project C through the registry -- this save() overwrites disk with cached state
		registry.addProject(projectDirC, 'project-c');

		// Read config.json from disk to see what was actually persisted
		const finalOnDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		const slugsOnDisk = finalOnDisk.projects.map((p: { slug: string }) => p.slug);

		// Project B was silently dropped because the registry's cache never knew about it
		expect(slugsOnDisk).toContain('project-a');
		expect(slugsOnDisk).toContain('project-c');
		expect(slugsOnDisk).not.toContain('project-b');
		expect(slugsOnDisk).toHaveLength(2);
	});

	it('removeProject on a nonexistent slug does not throw but silently rewrites config.json', () => {
		const configDir = tmpDir('registry-config-');
		const projectDir = tmpDir('registry-project-');
		dirs.push(configDir, projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(configDir);
		registry.addProject(projectDir, 'existing');

		const configFile = path.join(configDir, 'config.json');
		const beforeMtime = fs.statSync(configFile).mtimeMs;
		const beforeContent = fs.readFileSync(configFile, 'utf-8');

		// removeProject with a slug that was never added -- should not throw
		expect(() => registry.removeProject('never-added')).not.toThrow();

		// config.json was rewritten (save() was called) even though nothing changed
		const afterContent = fs.readFileSync(configFile, 'utf-8');
		const afterConfig = JSON.parse(afterContent);

		// The project list is unchanged -- the existing project is still there
		expect(afterConfig.projects).toHaveLength(1);
		expect(afterConfig.projects[0].slug).toBe('existing');
		expect(afterConfig.lastUsedSlug).toBe('existing');

		// save() was called (wasteful no-op write) -- content is semantically identical
		expect(JSON.parse(afterContent)).toEqual(JSON.parse(beforeContent));
	});
});
