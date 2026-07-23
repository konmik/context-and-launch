import { AgentWorktreeManager } from './agent-worktree.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { ConfigPaths } from '../config/config-paths.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { WorktreeCleanupService } from './worktree-cleanup.js';
import { cleanup, initGitRepo, tmpDir } from './agent-worktree.test-utils.js';

export { cleanup, initGitRepo, tmpDir };

export function makeCleanupEnv() {
	const dirs: string[] = [];

	function setup() {
		const configDir = tmpDir('wcs-config-');
		const projectDir = tmpDir('wcs-project-');
		const worktreeRoot = tmpDir('wcs-worktrees-');
		dirs.push(configDir, projectDir, worktreeRoot);

		initGitRepo(projectDir);

		const paths = new ConfigPaths(configDir);
		const lcm = new LauncherConfigManager(paths);
		lcm.saveProjectConfig('my-proj', {
			templates: [],
			skills: [],
			worktreeRootPath: worktreeRoot,
		});

		const awm = new AgentWorktreeManager(lcm, createTestCommandTemplateService());
		const service = new WorktreeCleanupService(awm);
		return { configDir, projectDir, worktreeRoot, lcm, awm, service };
	}

	function cleanupAll(): Promise<void> {
		const pending = [...dirs];
		dirs.length = 0;
		return cleanup(...pending);
	}

	return { dirs, setup, cleanupAll };
}
