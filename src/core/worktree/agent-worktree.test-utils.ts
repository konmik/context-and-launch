import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { git } from '~/test-git.js';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { initializeDataDir } from '../config/initialize.js';

export function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			// Prune worktrees before deleting to avoid git lock issues
			try { execSync('git worktree prune', { cwd: d, timeout: 5000 }); } catch { /* ok */ }
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// cleanup best-effort
		}
	}
}

const templateCache = new Map<string, string>();

function gitRepoTemplate(branch: string): string {
	let template = templateCache.get(branch);
	if (!template) {
		template = tmpDir(`git-tpl-${branch}-`);
		execSync(`git init -b ${branch}`, { cwd: template, timeout: 5000 });
		fs.writeFileSync(path.join(template, 'README.md'), '# test');
		execSync('git add .', { cwd: template, timeout: 5000 });
		execSync('git commit -m "init"', { cwd: template, timeout: 5000 });
		templateCache.set(branch, template);
	}
	return template;
}

export function initGitRepo(dir: string, branch = 'main'): void {
	fs.cpSync(gitRepoTemplate(branch), dir, { recursive: true });
}

export function makeWorktreeEnv() {
	const dirs: string[] = [];

	function setup(branch = 'main') {
		const configDir = tmpDir('awm-config-');
		const projectDir = tmpDir('awm-project-');
		const worktreeRoot = tmpDir('awm-worktrees-');
		dirs.push(configDir, projectDir, worktreeRoot);

		initGitRepo(projectDir, branch);

		const paths = new ConfigPaths(configDir);
		initializeDataDir(paths);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		return { configDir, projectDir, worktreeRoot, lcm, awm, paths };
	}

	// Sets up a project whose local main is one commit behind its upstream.
	async function setupBehindRemote() {
		const bareDir = tmpDir('awm-bare-');
		const projectDir = tmpDir('awm-behind-');
		const pusherDir = tmpDir('awm-pusher-');
		const configDir = tmpDir('awm-config-');
		const worktreeRoot = tmpDir('awm-worktrees-');
		dirs.push(bareDir, projectDir, pusherDir, configDir, worktreeRoot);

		await git(bareDir, 'init', '--bare', '-b', 'main');

		await git(os.tmpdir(), 'clone', bareDir, projectDir);
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		await git(projectDir, 'add', '.');
		await git(projectDir, 'commit', '-m', 'init');
		await git(projectDir, 'push', '-u', 'origin', 'main');

		await git(os.tmpdir(), 'clone', bareDir, pusherDir);
		fs.writeFileSync(path.join(pusherDir, 'ahead.txt'), 'ahead');
		await git(pusherDir, 'add', '.');
		await git(pusherDir, 'commit', '-m', 'ahead commit');
		await git(pusherDir, 'push');

		await git(projectDir, 'fetch');

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		return { projectDir, awm };
	}

	function cleanupAll() {
		cleanup(...dirs);
		dirs.length = 0;
	}

	return { dirs, setup, setupBehindRemote, cleanupAll };
}
