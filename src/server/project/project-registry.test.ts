import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectRegistry, generateProjectSlug, validateBranchName } from './project-registry.js';
import { ConfigPaths } from '../config/config-paths.js';
import { initializeDataDir } from '../config/initialize.js';

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

	function initConfigDir(prefix = 'registry-config-'): string {
		const configDir = tmpDir(prefix);
		dirs.push(configDir);
		initializeDataDir(new ConfigPaths(configDir));
		return configDir;
	}

	it('addProject with explicit projectSlug that collides is rejected', () => {
		const configDir = initConfigDir();
		const projectDir1 = tmpDir('registry-project1-');
		const projectDir2 = tmpDir('registry-project2-');
		dirs.push(projectDir1, projectDir2);

		fs.mkdirSync(path.join(projectDir1, '.git'));
		fs.mkdirSync(path.join(projectDir2, '.git'));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir1, 'my-project');

		expect(() => registry.addProject(projectDir2, 'my-project')).toThrow('Project slug already exists');
	});

	it('addProject rejects duplicate canonical path even when raw paths differ', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'first');

		// Build alternate path via subdir/..
		const subdir = path.join(projectDir, 'subdir');
		fs.mkdirSync(subdir);
		const altPath = path.join(projectDir, 'subdir', '..');

		expect(() => registry.addProject(altPath, 'second')).toThrow('already registered');
	});

	it('generateProjectSlug deduplicates when dir name and parent-dir-name combos collide', () => {
		expect(generateProjectSlug('/a/b/my-project', new Set(['my-project', 'b-my-project']))).toBe(
			'b-my-project-2'
		);

		expect(
			generateProjectSlug(
				'/a/b/my-project',
				new Set(['my-project', 'b-my-project', 'b-my-project-2'])
			)
		).toBe('b-my-project-3');
	});

	it('config file is created on first addProject', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir);

		expect(fs.existsSync(path.join(configDir, 'config', 'config.json'))).toBe(true);
	});

	it('malformed config.json throws', () => {
		const configDir = tmpDir('registry-config-');
		dirs.push(configDir);

		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		fs.writeFileSync(path.join(configDir, 'config', 'config.json'), 'not valid json');

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		expect(() => registry.listProjects()).toThrow();
	});

	it('getDefaultProjectSlug returns lastUsedProjectSlug if valid', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'test-project');

		expect(registry.getDefaultProjectSlug()).toBe('test-project');
	});

	it('getDefaultProjectSlug returns first project if lastUsedProjectSlug is invalid', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'test-project');

		// Manually corrupt lastUsedProjectSlug
		const configFile = path.join(configDir, 'config', 'config.json');
		const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		config.lastUsedProjectSlug = 'nonexistent';
		fs.writeFileSync(configFile, JSON.stringify(config));

		const registry2 = new ProjectRegistry(new ConfigPaths(configDir));
		expect(registry2.getDefaultProjectSlug()).toBe('test-project');
	});

	it('removeProject clears lastUsedProjectSlug when removing the last-used project', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'remove-me');
		registry.removeProject('remove-me');

		expect(registry.getDefaultProjectSlug()).toBeNull();
	});

	it('external edit to config.json after cache is populated is invisible to listProjects', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'original');

		// Externally add a second project directly to config.json on disk
		const configFile = path.join(configDir, 'config', 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		onDisk.projects.push({ path: '/fake/external-project', projectSlug: 'external' });
		fs.writeFileSync(configFile, JSON.stringify(onDisk, null, 2));

		// The registry still uses its in-memory cache, so the external project is invisible
		const slugs = registry.listProjects().map((p) => p.projectSlug);
		expect(slugs).toContain('original');
		expect(slugs).not.toContain('external');
		expect(slugs).toHaveLength(1);
	});

	it('external edit is overwritten on save: adding project C after external B silently drops B', () => {
		const configDir = initConfigDir();
		const projectDirA = tmpDir('registry-projectA-');
		const projectDirC = tmpDir('registry-projectC-');
		dirs.push(projectDirA, projectDirC);

		fs.mkdirSync(path.join(projectDirA, '.git'));
		fs.mkdirSync(path.join(projectDirC, '.git'));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDirA, 'project-a');

		// Externally add project B directly to config.json on disk
		const configFile = path.join(configDir, 'config', 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		onDisk.projects.push({ path: '/fake/project-b', projectSlug: 'project-b' });
		fs.writeFileSync(configFile, JSON.stringify(onDisk, null, 2));

		// Now add project C through the registry -- this save() overwrites disk with cached state
		registry.addProject(projectDirC, 'project-c');

		// Read config.json from disk to see what was actually persisted
		const finalOnDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		const slugsOnDisk = finalOnDisk.projects.map((p: { projectSlug: string }) => p.projectSlug);

		// Project B was silently dropped because the registry's cache never knew about it
		expect(slugsOnDisk).toContain('project-a');
		expect(slugsOnDisk).toContain('project-c');
		expect(slugsOnDisk).not.toContain('project-b');
		expect(slugsOnDisk).toHaveLength(2);
	});

	it('H7.16 - addProject with a tilde path throws "Path does not exist" (no tilde expansion)', () => {
		const configDir = initConfigDir();

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		// fs.existsSync does not expand ~ -- the literal path "~/nonexistent" does not exist
		expect(() => registry.addProject('~/nonexistent')).toThrow('Path does not exist');
	});

	it('H7.16 - addProject with trailing whitespace in path throws "Path does not exist"', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		// The path with trailing space does not exist as a filesystem entry (at least on Windows/Linux)
		// existsSync returns false for the padded path, so we get a clear "Path does not exist" error
		expect(() => registry.addProject(projectDir + ' ')).toThrow('Path does not exist');
	});

	it('H7.25 - generateProjectSlug falls back to "project" when base name is entirely non-alphanumeric', () => {
		// Path whose base is all special characters -- toSlugSegment strips everything, leaving ""
		// generateProjectSlug should fall back to "project"
		expect(generateProjectSlug('/@@@/!!!', new Set())).toBe('project');
		// If "project" is already taken, it tries parent-name combination.
		// Parent segment is "@@@" -> toSlugSegment -> "" (empty), so base stays "project" (no prefix).
		// The deduplication then appends a numeric suffix.
		expect(generateProjectSlug('/@@@/!!!', new Set(['project']))).toBe('project-2');
		expect(generateProjectSlug('/@@@/!!!', new Set(['project', 'project-2']))).toBe('project-3');
	});

	it('H7.25 - generateProjectSlug with a very long path produces an unbounded projectSlug (no truncation)', () => {
		const longSegment = 'a'.repeat(200);
		const parentSegment = 'b'.repeat(200);

		// No collision: projectSlug equals the full lowercased base name, no truncation
		const projectSlug = generateProjectSlug(`/${parentSegment}/${longSegment}`, new Set());
		expect(projectSlug).toBe(longSegment);
		expect(projectSlug.length).toBe(200);

		// When base collides, projectSlug becomes parent-base (200 + 1 + 200 = 401 chars)
		const slugWithParent = generateProjectSlug(
			`/${parentSegment}/${longSegment}`,
			new Set([longSegment])
		);
		expect(slugWithParent).toBe(`${parentSegment}-${longSegment}`);
		expect(slugWithParent.length).toBe(401);

		// Confirm addProject with a long directory name produces the expected long projectSlug
		const configDir = initConfigDir();
		const parentDir = tmpDir('registry-parent-');
		const longDirName = 'z'.repeat(100); // keep OS-safe (most filesystems cap filename at 255 bytes)
		const longProjectDir = path.join(parentDir, longDirName);
		dirs.push(parentDir);
		fs.mkdirSync(longProjectDir);
		fs.mkdirSync(path.join(longProjectDir, '.git'));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		const info = registry.addProject(longProjectDir);
		expect(info.projectSlug).toBe(longDirName);
		expect(info.projectSlug.length).toBe(100);
	});

	it('removeProject on a nonexistent projectSlug does not throw but silently rewrites config.json', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'existing');

		const configFile = path.join(configDir, 'config', 'config.json');
		const beforeMtime = fs.statSync(configFile).mtimeMs;
		const beforeContent = fs.readFileSync(configFile, 'utf-8');

		// removeProject with a projectSlug that was never added -- should not throw
		expect(() => registry.removeProject('never-added')).not.toThrow();

		// config.json was rewritten (save() was called) even though nothing changed
		const afterContent = fs.readFileSync(configFile, 'utf-8');
		const afterConfig = JSON.parse(afterContent);

		// The project list is unchanged -- the existing project is still there
		expect(afterConfig.projects).toHaveLength(1);
		expect(afterConfig.projects[0].projectSlug).toBe('existing');
		expect(afterConfig.lastUsedProjectSlug).toBe('existing');

		// save() was called (wasteful no-op write) -- content is semantically identical
		expect(JSON.parse(afterContent)).toEqual(JSON.parse(beforeContent));
	});

	it('port and browser fields round-trip without data loss', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));

		// Write config with port and browser
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		const configFile = path.join(configDir, 'config', 'config.json');
		fs.writeFileSync(configFile, JSON.stringify({
			projects: [],
			lastUsedProjectSlug: null,
			port: 9999,
			browser: "msedge"
		}));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		expect(registry.getPort()).toBe(9999);
		expect(registry.getBrowser()).toBe('msedge');

		// Adding a project should preserve port and browser
		registry.addProject(projectDir, 'test-project');

		const afterAdd = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(afterAdd.port).toBe(9999);
		expect(afterAdd.browser).toBe('msedge');

		// Removing a project should preserve port and browser
		registry.removeProject('test-project');

		const afterRemove = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(afterRemove.port).toBe(9999);
		expect(afterRemove.browser).toBe('msedge');
	});

	it('getPort returns default 14780 when not specified', () => {
		const configDir = initConfigDir();

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		expect(registry.getPort()).toBe(14780);
	});

	it('getBrowser returns default "chrome" when not specified', () => {
		const configDir = initConfigDir();

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		expect(registry.getBrowser()).toBe('chrome');
	});

	it('save preserves unknown fields added by external tools', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });

		const configFile = path.join(configDir, 'config', 'config.json');
		fs.writeFileSync(configFile, JSON.stringify({
			projects: [],
			lastUsedProjectSlug: null,
			port: 8080,
			browser: 'firefox',
			theme: 'dark',
			customField: { nested: true }
		}));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'test');

		const afterSave = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		// Unknown fields are preserved through round-trip
		expect(afterSave.theme).toBe('dark');
		expect(afterSave.customField).toEqual({ nested: true });
		// Known fields are preserved
		expect(afterSave.port).toBe(8080);
		expect(afterSave.browser).toBe('firefox');
	});

	it('two registry instances: second overwrites first on save', () => {
		const configDir = initConfigDir();
		const projectDir1 = tmpDir('registry-project1-');
		const projectDir2 = tmpDir('registry-project2-');
		dirs.push(projectDir1, projectDir2);

		fs.mkdirSync(path.join(projectDir1, '.git'));
		fs.mkdirSync(path.join(projectDir2, '.git'));

		const registry1 = new ProjectRegistry(new ConfigPaths(configDir));
		registry1.addProject(projectDir1, 'from-instance-1');

		const registry2 = new ProjectRegistry(new ConfigPaths(configDir));
		registry2.addProject(projectDir2, 'from-instance-2');

		// Both projects exist on disk because registry2 loaded from disk before caching
		const configFile = path.join(configDir, 'config', 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		const slugs = onDisk.projects.map((p: { projectSlug: string }) => p.projectSlug);
		expect(slugs).toContain('from-instance-1');
		expect(slugs).toContain('from-instance-2');
	});

	it('two registry instances: first instance save after second clobbers second changes', () => {
		const configDir = initConfigDir();
		const projectDir1 = tmpDir('registry-project1-');
		const projectDir2 = tmpDir('registry-project2-');
		const projectDir3 = tmpDir('registry-project3-');
		dirs.push(projectDir1, projectDir2, projectDir3);

		fs.mkdirSync(path.join(projectDir1, '.git'));
		fs.mkdirSync(path.join(projectDir2, '.git'));
		fs.mkdirSync(path.join(projectDir3, '.git'));

		// Both instances start with the same initial state (one project)
		const registry1 = new ProjectRegistry(new ConfigPaths(configDir));
		registry1.addProject(projectDir1, 'initial');

		const registry2 = new ProjectRegistry(new ConfigPaths(configDir));
		// registry2 reads from disk, caches state with 'initial'

		// registry2 adds its project (disk now has initial + from-2)
		registry2.addProject(projectDir2, 'from-2');

		// registry1 still has stale cache (only 'initial'), adding overwrites disk
		registry1.addProject(projectDir3, 'from-1-late');

		const configFile = path.join(configDir, 'config', 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		const slugs = onDisk.projects.map((p: { projectSlug: string }) => p.projectSlug);

		// registry1's save used its stale cache: 'initial' + 'from-1-late'
		// 'from-2' was silently dropped
		expect(slugs).toContain('initial');
		expect(slugs).toContain('from-1-late');
		expect(slugs).not.toContain('from-2');
	});

	it('setLastUsed with stale cache ignores projectSlug that exists on disk but not in cache', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		// Cache is populated as empty (no projects)
		expect(registry.listProjects()).toHaveLength(0);

		// Externally add a project directly to disk
		const configFile = path.join(configDir, 'config', 'config.json');
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });
		fs.writeFileSync(configFile, JSON.stringify({
			projects: [{ path: projectDir, projectSlug: 'disk-only' }],
			lastUsedProjectSlug: null
		}));

		// setLastUsed checks the cached project list, which is empty
		registry.setLastUsed('disk-only');

		// lastUsedProjectSlug was NOT updated because cache doesn't know about 'disk-only'
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(onDisk.lastUsedProjectSlug).toBeNull();
	});

	it('updateProject preserves port and browser fields', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });

		const configFile = path.join(configDir, 'config', 'config.json');
		fs.writeFileSync(configFile, JSON.stringify({
			projects: [{ path: fs.realpathSync(projectDir), projectSlug: 'my-proj' }],
			lastUsedProjectSlug: 'my-proj',
			port: 3000,
			browser: 'safari'
		}));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.updateProject('my-proj', undefined, 'renamed');

		const afterUpdate = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(afterUpdate.port).toBe(3000);
		expect(afterUpdate.browser).toBe('safari');
		expect(afterUpdate.projects[0].projectSlug).toBe('renamed');
		expect(afterUpdate.lastUsedProjectSlug).toBe('renamed');
	});

	it('addProject stores the chosen branch and listProjects returns it', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		const info = registry.addProject(projectDir, 'branch-proj', 'tickets');
		expect(info.branch).toBe('tickets');

		const listed = registry.listProjects().find((p) => p.projectSlug === 'branch-proj');
		expect(listed?.branch).toBe('tickets');

		const onDisk = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'config.json'), 'utf-8')
		);
		expect(onDisk.projects[0].branch).toBe('tickets');
	});

	it('addProject without a branch leaves the field undefined (legacy fallback)', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		const info = registry.addProject(projectDir, 'no-branch');
		expect(info.branch).toBeUndefined();

		const onDisk = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'config.json'), 'utf-8')
		);
		expect('branch' in onDisk.projects[0]).toBe(false);
	});

	it('addProject rejects an invalid branch name before registering', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		expect(() => registry.addProject(projectDir, 'bad', 'has space')).toThrow('whitespace');
		expect(registry.listProjects()).toHaveLength(0);
	});

	it('addProject stores ticketsPath, getTicketsPath returns it, and rename preserves it', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		const info = registry.addProject(projectDir, 'tix-proj', 'tickets', 'D:\\my-tickets');
		expect(info.ticketsPath).toBe('D:\\my-tickets');
		expect(registry.getTicketsPath('tix-proj')).toBe('D:\\my-tickets');

		const updated = registry.updateProject('tix-proj', undefined, 'renamed');
		expect(updated.ticketsPath).toBe('D:\\my-tickets');
		expect(registry.getTicketsPath('renamed')).toBe('D:\\my-tickets');
	});

	it('updateProject preserves the branch field across rename', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'before', 'tasks');
		const updated = registry.updateProject('before', undefined, 'after');
		expect(updated.branch).toBe('tasks');

		const onDisk = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'config.json'), 'utf-8')
		);
		expect(onDisk.projects[0].branch).toBe('tasks');
	});

	it('validateBranchName accepts valid names and rejects invalid ones', () => {
		expect(() => validateBranchName('tickets')).not.toThrow();
		expect(() => validateBranchName('feature/work-items')).not.toThrow();
		expect(() => validateBranchName('release-1.2')).not.toThrow();

		expect(() => validateBranchName('')).toThrow('empty');
		expect(() => validateBranchName('a b')).toThrow('whitespace');
		expect(() => validateBranchName('a~b')).toThrow('invalid characters');
		expect(() => validateBranchName('a..b')).toThrow('".."');
		expect(() => validateBranchName('a//b')).toThrow('"//"');
		expect(() => validateBranchName('/lead')).toThrow('"/"');
		expect(() => validateBranchName('trail/')).toThrow('"/"');
		expect(() => validateBranchName('-lead')).toThrow('"-"');
		expect(() => validateBranchName('.lead')).toThrow('"."');
		expect(() => validateBranchName('trail.')).toThrow('"."');
		expect(() => validateBranchName('x.lock')).toThrow('.lock');
		expect(() => validateBranchName('@')).toThrow('"@"');
		expect(() => validateBranchName('a@{b')).toThrow('"@{"');
	});

	it('getLastUsedProfileName returns null for a fresh config and the stored value after set', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'profile-proj');

		expect(registry.getLastUsedProfileName()).toBeNull();

		registry.setLastUsedProfileName('Claude');
		expect(registry.getLastUsedProfileName()).toBe('Claude');

		const onDisk = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'config.json'), 'utf-8')
		);
		expect(onDisk.lastUsedProfileName).toBe('Claude');
	});

	it('setLastUsedProfileName rejects an empty profile name', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'profile-proj');

		expect(() => registry.setLastUsedProfileName('')).toThrow('profileName cannot be empty');
	});

	it('lastUsedProfileName survives add/update/remove/setLastUsed round-trips', () => {
		const configDir = initConfigDir();
		const projectDir1 = tmpDir('registry-project1-');
		const projectDir2 = tmpDir('registry-project2-');
		dirs.push(projectDir1, projectDir2);

		fs.mkdirSync(path.join(projectDir1, '.git'));
		fs.mkdirSync(path.join(projectDir2, '.git'));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir1, 'alpha');
		registry.setLastUsedProfileName('Claude');

		registry.addProject(projectDir2, 'beta');
		expect(registry.getLastUsedProfileName()).toBe('Claude');

		registry.updateProject('beta', undefined, 'beta-renamed');
		expect(registry.getLastUsedProfileName()).toBe('Claude');

		registry.setLastUsed('alpha');
		expect(registry.getLastUsedProfileName()).toBe('Claude');

		registry.removeProject('alpha');
		expect(registry.getLastUsedProfileName()).toBe('Claude');

		const onDisk = JSON.parse(
			fs.readFileSync(path.join(configDir, 'config', 'config.json'), 'utf-8')
		);
		expect(onDisk.lastUsedProfileName).toBe('Claude');
	});

	it('external-config-edit-clobbered-by-set: external field written after load is dropped on set', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.addProject(projectDir, 'alpha');

		const configFile = path.join(configDir, 'config', 'config.json');
		const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		onDisk.theme = 'dark';
		fs.writeFileSync(configFile, JSON.stringify(onDisk, null, 2));

		registry.setLastUsedProfileName('Codex');

		const afterSave = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(afterSave.theme).toBe('dark');
		expect(afterSave.lastUsedProfileName).toBe('Codex');
	});

	it('setLastUsedProfileName preserves unknown external fields', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });

		const configFile = path.join(configDir, 'config', 'config.json');
		fs.writeFileSync(configFile, JSON.stringify({
			projects: [],
			lastUsedProjectSlug: null,
			theme: 'dark'
		}));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.setLastUsedProfileName('Codex');

		const afterSave = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(afterSave.theme).toBe('dark');
		expect(afterSave.lastUsedProfileName).toBe('Codex');
	});

	it('setLastUsed preserves port and browser fields', () => {
		const configDir = initConfigDir();
		const projectDir = tmpDir('registry-project-');
		dirs.push(projectDir);

		fs.mkdirSync(path.join(projectDir, '.git'));
		fs.mkdirSync(path.join(configDir, 'config'), { recursive: true });

		const configFile = path.join(configDir, 'config', 'config.json');
		fs.writeFileSync(configFile, JSON.stringify({
			projects: [
				{ path: fs.realpathSync(projectDir), projectSlug: 'alpha' },
				{ path: '/fake/beta', projectSlug: 'beta' }
			],
			lastUsedProjectSlug: 'alpha',
			port: 5555,
			browser: 'edge'
		}));

		const registry = new ProjectRegistry(new ConfigPaths(configDir));
		registry.setLastUsed('beta');

		const afterSet = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
		expect(afterSet.port).toBe(5555);
		expect(afterSet.browser).toBe('edge');
		expect(afterSet.lastUsedProjectSlug).toBe('beta');
	});
});
