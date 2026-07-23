import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, execSync } from 'child_process';
import { gitSync, setGitOriginUrl } from '~/test-git.js';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { initializeDataDir } from '../config/initialize.js';

export function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanup(...dirs: string[]): Promise<void> {
	return Promise.all(dirs.map(async (dir) => {
		await pruneWorktreeRegistrations(dir);
		try {
			await fs.promises.rm(dir, { recursive: true, force: true });
		} catch (err) {
			console.warn(`cleanup ${dir}: ${err instanceof Error ? err.message : String(err)}`);
		}
	})).then(() => undefined);
}

function pruneWorktreeRegistrations(dir: string): Promise<void> {
	if (!fs.existsSync(path.join(dir, '.git', 'worktrees'))) return Promise.resolve();
	return new Promise((resolve) => {
		execFile('git', ['worktree', 'prune'], { cwd: dir, timeout: 5000 }, (error) => {
			if (error) console.warn(`worktree prune ${dir}: ${error.message}`);
			resolve();
		});
	});
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

let behindRemoteTemplate: { bareDir: string; projectDir: string } | undefined;

function getBehindRemoteTemplate(): { bareDir: string; projectDir: string } {
	if (!behindRemoteTemplate) {
		const bareDir = tmpDir('awm-bare-tpl-');
		gitSync(bareDir, 'init', '--bare', '-b', 'main');

		const projectDir = tmpDir('awm-behind-tpl-');
		gitSync(os.tmpdir(), 'clone', bareDir, projectDir);
		fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
		gitSync(projectDir, 'add', '.');
		gitSync(projectDir, 'commit', '-m', 'init');
		gitSync(projectDir, 'push', '-u', 'origin', 'main');

		const pusherDir = tmpDir('awm-pusher-tpl-');
		gitSync(os.tmpdir(), 'clone', bareDir, pusherDir);
		fs.writeFileSync(path.join(pusherDir, 'ahead.txt'), 'ahead');
		gitSync(pusherDir, 'add', '.');
		gitSync(pusherDir, 'commit', '-m', 'ahead commit');
		gitSync(pusherDir, 'push');

		gitSync(projectDir, 'fetch');

		behindRemoteTemplate = { bareDir, projectDir };
	}
	return behindRemoteTemplate;
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
	function setupBehindRemote() {
		const template = getBehindRemoteTemplate();
		const bareDir = tmpDir('awm-bare-');
		fs.cpSync(template.bareDir, bareDir, { recursive: true });
		const projectDir = tmpDir('awm-behind-');
		fs.cpSync(template.projectDir, projectDir, { recursive: true });
		setGitOriginUrl(projectDir, bareDir);
		const configDir = tmpDir('awm-config-');
		const worktreeRoot = tmpDir('awm-worktrees-');
		dirs.push(bareDir, projectDir, configDir, worktreeRoot);

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

	function cleanupAll(): Promise<void> {
		const pending = [...dirs];
		dirs.length = 0;
		return cleanup(...pending);
	}

	return { dirs, setup, setupBehindRemote, cleanupAll };
}
