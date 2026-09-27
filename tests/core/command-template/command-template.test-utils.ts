import os from 'os'
import path from 'path'
import { createConfigPaths } from '../../../src/core/config/config-paths.js'
import { createConfigRepository } from '../../../src/core/config/config-repository.js'
import { createCommandTemplateService, type CommandTemplateService } from '../../../src/core/command-template/command-template-service.js'
import { createCommandTemplateStore } from '../../../src/core/command-template/command-template-store.js'
import { createFixedPlatformShellRunner } from '../../../src/core/command-template/platform-shell-runner.js'
import type { PlatformShellRunner, ShellExecutionRequest } from '../../../src/core/command-template/command-template-types.js'
import { buildTestGitEnvironment } from '../../test-git-env.js'

/**
 * Base dir deliberately points at a directory that is never created, so the
 * store finds no overrides file and tests always run the bundled defaults
 * instead of whatever the developer has customized locally.
 */
const NO_OVERRIDES_BASE_DIR = path.join(os.tmpdir(), 'context-launch-test-no-overrides')

/**
 * A real Command Template executor backed by the bundled defaults, for tests
 * that drive managers against real repositories on disk.
 */
export function createTestCommandTemplateService(baseDir: string = NO_OVERRIDES_BASE_DIR): CommandTemplateService {
  const paths = createConfigPaths(baseDir)
  const shellRunner = createFixedPlatformShellRunner()
  const runner: PlatformShellRunner = {
    execute: (request) => shellRunner.execute(withTestGitEnvironment(request)),
    executeSync: (request) => shellRunner.executeSync(withTestGitEnvironment(request)),
  }
  return createCommandTemplateService(createCommandTemplateStore(paths, createConfigRepository()), runner)
}

export function withTestGitEnvironment(request: ShellExecutionRequest): ShellExecutionRequest {
  return {
    ...request,
    environment: buildTestGitEnvironment(request.environment),
  }
}
