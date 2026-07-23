import os from 'os';
import path from 'path';
import { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { CommandTemplateService } from './command-template-service.js';
import { CommandTemplateStore } from './command-template-store.js';
import { FixedPlatformShellRunner } from './platform-shell-runner.js';
import type {
	PlatformShellRunner, ShellExecutionRequest,
} from './command-template-types.js';
import { buildTestGitEnvironment } from '../../test-git-env.js';

/**
 * Base dir deliberately points at a directory that is never created, so the
 * store finds no overrides file and tests always run the bundled defaults
 * instead of whatever the developer has customized locally.
 */
const NO_OVERRIDES_BASE_DIR = path.join(os.tmpdir(), 'context-launch-test-no-overrides');

/**
 * A real Command Template executor backed by the bundled defaults, for tests
 * that drive managers against real repositories on disk.
 */
export function createTestCommandTemplateService(
	baseDir: string = NO_OVERRIDES_BASE_DIR,
): CommandTemplateService {
	const paths = new ConfigPaths(baseDir);
	const shellRunner = new FixedPlatformShellRunner();
	const runner: PlatformShellRunner = {
		execute: (request) => shellRunner.execute(withTestGitEnvironment(request)),
		executeSync: (request) => shellRunner.executeSync(withTestGitEnvironment(request)),
	};
	return new CommandTemplateService(
		new CommandTemplateStore(paths, new ConfigRepository()),
		runner,
	);
}

export function withTestGitEnvironment(request: ShellExecutionRequest): ShellExecutionRequest {
	return {
		...request,
		environment: buildTestGitEnvironment(request.environment),
	};
}
