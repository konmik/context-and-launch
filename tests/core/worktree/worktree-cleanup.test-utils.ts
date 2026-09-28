import type { LauncherConfigManager } from '../../../src/core/launcher/launcher-config.js'
import type { AgentWorktreeManager } from '../../../src/core/worktree/agent-worktree.js'
import { cleanup, initGitRepo, makeProjectEnv, tmpDir } from './agent-worktree.test-utils.js'

export { cleanup, initGitRepo, tmpDir }

export function makeCleanupEnv(): CleanupEnvResult {
  const dirs: string[] = []

  function setup(): SetupResult {
    const projectDir = tmpDir('wcs-project-')
    dirs.push(projectDir)
    initGitRepo(projectDir)
    const { configDir, worktreeRoot, lcm, awm } = makeProjectEnv('wcs', dirs)
    return {
      configDir,
      projectDir,
      worktreeRoot,
      lcm,
      awm,
    }
  }

  function cleanupAll(): Promise<void> {
    const pending = [...dirs]
    dirs.length = 0
    return cleanup(...pending)
  }

  return {
    dirs,
    setup,
    cleanupAll,
  }
}

export interface CleanupEnvResult {
  dirs: string[]
  setup: () => SetupResult
  cleanupAll: () => Promise<void>
}

export interface SetupResult {
  configDir: string
  projectDir: string
  worktreeRoot: string
  lcm: LauncherConfigManager
  awm: AgentWorktreeManager
}
