import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, execSync } from 'child_process';
import { gitSync, setGitOriginUrl } from '~/test-git.js';
import {
	makeTempDir, removeTempDirOrWarn, lazyTemplate, keyedTemplate, cloneFromTemplate,
} from '~/test-temp.js';
import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { initializeDataDir } from '../config/initialize.js';

export { makeTempDir as tmpDir };

export function cleanup(...dirs: string[]): Promise<void> {
	return Promise.all(dirs.map(async (dir) => {
		await pruneWorktreeRegistrations(dir);
		await removeTempDirOrWarn(dir);
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

const gitRepoTemplate = keyedTemplate((branch: string) => {
	const template = makeTempDir(`git-tpl-${branch}-`);
	execSync(`git init -b ${branch}`, { cwd: template, timeout: 5000 });
	fs.writeFileSync(path.join(template, 'README.md'), '# test');
	execSync('git add .', { cwd: template, timeout: 5000 });
	execSync('git commit -m "init"', { cwd: template, timeout: 5000 });
	return template;
});

export function initGitRepo(dir: string, branch = 'main'): void {
	fs.cpSync(gitRepoTemplate(branch), dir, { recursive: true });
}

const getBehindRemoteTemplate = lazyTemplate(() => {
	const bareDir = makeTempDir('awm-bare-tpl-');
	gitSync(bareDir, 'init', '--bare', '-b', 'main');

	const projectDir = makeTempDir('awm-behind-tpl-');
	gitSync(os.tmpdir(), 'clone', bareDir, projectDir);
	fs.writeFileSync(path.join(projectDir, 'README.md'), '# test');
	gitSync(projectDir, 'add', '.');
	gitSync(projectDir, 'commit', '-m', 'init');
	gitSync(projectDir, 'push', '-u', 'origin', 'main');

	const pusherDir = makeTempDir('awm-pusher-tpl-');
	gitSync(os.tmpdir(), 'clone', bareDir, pusherDir);
	fs.writeFileSync(path.join(pusherDir, 'ahead.txt'), 'ahead');
	gitSync(pusherDir, 'add', '.');
	gitSync(pusherDir, 'commit', '-m', 'ahead commit');
	gitSync(pusherDir, 'push');

	gitSync(projectDir, 'fetch');

	return { bareDir, projectDir };
});

export function makeProjectEnv(prefixBase: string, dirs: string[]) {
	const configDir = makeTempDir(`${prefixBase}-config-`);
	const worktreeRoot = makeTempDir(`${prefixBase}-worktrees-`);
	dirs.push(configDir, worktreeRoot);

	const paths = new ConfigPaths(configDir);
	initializeDataDir(paths);
	const lcm = new LauncherConfigManager(paths);
	lcm.saveProjectConfig('my-proj', {
		templates: [],
		skills: [],
		worktreeRootPath: worktreeRoot,
	});

	const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
	return { configDir, worktreeRoot, paths, lcm, awm };
}

export function makeWorktreeEnv() {
	const dirs: string[] = [];

	function setup(branch = 'main') {
		const projectDir = makeTempDir('awm-project-');
		dirs.push(projectDir);
		initGitRepo(projectDir, branch);
		const { configDir, worktreeRoot, paths, lcm, awm } = makeProjectEnv('awm', dirs);
		return { configDir, projectDir, worktreeRoot, lcm, awm, paths };
	}

	// Sets up a project whose local main is one commit behind its upstream.
	function setupBehindRemote() {
		const template = getBehindRemoteTemplate();
		const bareDir = cloneFromTemplate(template.bareDir, 'awm-bare-');
		const projectDir = cloneFromTemplate(template.projectDir, 'awm-behind-');
		setGitOriginUrl(projectDir, bareDir);
		dirs.push(bareDir, projectDir);
		const { awm } = makeProjectEnv('awm', dirs);
		return { projectDir, awm };
	}

	function cleanupAll(): Promise<void> {
		const pending = [...dirs];
		dirs.length = 0;
		return cleanup(...pending);
	}

	return { dirs, setup, setupBehindRemote, cleanupAll };
}
