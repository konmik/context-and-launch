import fs from 'fs'
import { success, failure, type Result } from '../../util/result.js'
import path from 'path'
import { rename } from 'fs/promises'
import { writeMergeTree } from '../infra/git-merge-tree.js'
import { isProcessError, createValidationError, type ValidationError, errorMessage } from '../shared/errors.js'
import { appLog } from '../infra/app-logger.js'
import { createGitRepository, type GitRepository } from '../infra/git-repository.js'
import { resolveAgentWorktreeLocation } from './worktree-naming.js'
import type { LauncherConfigManager } from '../launcher/launcher-config.js'
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'

function canonicalize(p: string): string {
  const slashed = p.replace(/\\/g, '/')
  try {
    return fs.realpathSync(slashed)
  } catch {
    try {
      const parent = path.posix.dirname(slashed)
      const base = path.posix.basename(slashed)
      return `${fs.realpathSync(parent)}/${base}`
    } catch {
      return slashed
    }
  }
}

function pathsReferToSameEntry(left: string, right: string): boolean {
  if (canonicalize(left) === canonicalize(right)) return true
  try {
    const leftStat = fs.statSync(left)
    const rightStat = fs.statSync(right)
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino
  } catch {
    return false
  }
}

export interface NotWorktreeWorktreeOwnership {
  kind: 'not-worktree'
}

export interface CurrentProjectWorktreeOwnership {
  kind: 'current-project'
}

export interface DifferentProjectWorktreeOwnership {
  kind: 'different-project'
}

export type WorktreeOwnership = NotWorktreeWorktreeOwnership | CurrentProjectWorktreeOwnership | DifferentProjectWorktreeOwnership

export function foreignWorktreeMessage(worktreePath: string): string {
  return `The saved worktree belongs to a different project: ${worktreePath}.` + ' Remove it from its original project before retrying.'
}

export interface ForeignWorktreeError extends ValidationError {}

const foreignWorktreeErrors = new WeakSet<Error>()

export function createForeignWorktreeError(worktreePath: string): ForeignWorktreeError {
  const error = createValidationError(foreignWorktreeMessage(worktreePath))
  error.name = 'ForeignWorktreeError'
  foreignWorktreeErrors.add(error)
  return error
}

export function isForeignWorktreeError(cause: unknown): cause is ForeignWorktreeError {
  return cause instanceof Error && foreignWorktreeErrors.has(cause)
}

export interface LockingProcessInfo {
  pid: number
  processName: string
}

function parseLsofProcesses(stdout: string): LockingProcessInfo[] {
  const seen = new Set<number>()
  const result: LockingProcessInfo[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim() || line.startsWith('COMMAND')) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2) continue
    const pid = parseInt(parts[1], 10)
    if (isNaN(pid) || seen.has(pid) || pid === process.pid) continue
    seen.add(pid)
    result.push({
      pid,
      processName: parts[0],
    })
  }
  return result
}

function parseTabSeparatedProcesses(stdout: string): LockingProcessInfo[] {
  const seen = new Set<number>()
  const result: LockingProcessInfo[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const parts = line.trim().split('\t')
    if (parts.length < 2) continue
    const pid = parseInt(parts[0], 10)
    if (isNaN(pid) || seen.has(pid) || pid === process.pid) continue
    seen.add(pid)
    result.push({
      pid,
      processName: parts[1],
    })
  }
  return result
}

export interface SavedWorktreeInfo {
  branchName: string
  agentWorktreePath: string
}

export function toSavedWorktreeInfo(task: {
  agentWorktreeBranchName?: string
  agentWorktreeDir?: string
}): SavedWorktreeInfo | undefined {
  if (task.agentWorktreeBranchName && task.agentWorktreeDir) {
    return {
      branchName: task.agentWorktreeBranchName,
      agentWorktreePath: task.agentWorktreeDir,
    }
  }
  return undefined
}

export interface WorktreeResult {
  worktreePath: string
  branchName: string
  behindRemote?: true
}

export interface DirtyWorktreeResult {
  dirtyWorktree: true
}

export interface AgentWorktreeManager {
  getMainBranch(projectPath: string, configuredBranch?: string): Promise<string>
  ensureAgentWorktree(
    projectPath: string,
    projectSlug: string,
    folderName: string,
    options?: {
      skipDirtyCheck?: boolean
      requireNew?: boolean
    },
    configuredBranch?: string,
    savedWorktreeInfo?: SavedWorktreeInfo,
  ): Promise<Result<WorktreeResult, DirtyWorktreeResult>>
  isWorktreeClean(worktreePath: string): Promise<boolean>
  isGitWorktree(worktreePath: string): boolean
  getWorktreeOwnership(projectPath: string, worktreePath: string): Promise<WorktreeOwnership>
  hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean>
  isWorktreeBusy(worktreePath: string): Promise<boolean>
  findLockingProcesses(worktreePath: string): Promise<LockingProcessInfo[]>
  localBranchExists(projectPath: string, branchName: string): Promise<boolean>
  worktreePathForBranch(projectPath: string, branchName: string): Promise<string | undefined>
  isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean>
  removeWorktree(projectPath: string, worktreePath: string): Promise<void>
  deleteLocalBranch(projectPath: string, branchName: string, configuredBranch?: string): Promise<void>
  forceDeleteLocalBranch(projectPath: string, branchName: string): Promise<void>
  deleteRemoteBranch(projectPath: string, branchName: string): Promise<void>
}

export function createAgentWorktreeManager(launcherConfig: LauncherConfigManager, commands: CommandTemplateExecutor): AgentWorktreeManager {
  let repository: GitRepository
  repository = createGitRepository(commands)

  async function getMainBranch(projectPath: string, configuredBranch?: string): Promise<string> {
    const trimmed = configuredBranch?.trim()
    if (trimmed) return trimmed
    for (const branch of ['main', 'master']) {
      const result = await commands.execute('git.main-branch.probe', projectPath, {
        branch,
      })
      if (result.trim()) return branch
    }
    throw new Error('Neither main nor master branch exists')
  }

  async function ensureAgentWorktree(
    projectPath: string,
    projectSlug: string,
    folderName: string,
    options?: {
      skipDirtyCheck?: boolean
      requireNew?: boolean
    },
    configuredBranch?: string,
    savedWorktreeInfo?: SavedWorktreeInfo,
  ): Promise<Result<WorktreeResult, DirtyWorktreeResult>> {
    const { worktreeRootPath, branchPrefix } = launcherConfig.resolveWorktreeSettings(projectSlug)
    const { worktreePath, branchName } = resolveAgentWorktreeLocation(
      folderName,
      {
        worktreeRootPath,
        branchPrefix,
      },
      savedWorktreeInfo && {
        savedWorktreePath: savedWorktreeInfo.agentWorktreePath,
        savedBranchName: savedWorktreeInfo.branchName,
      },
    )
    const mainBranch = await getMainBranch(projectPath, configuredBranch) // Reusing an existing worktree does not touch main, so main's state is irrelevant.
    if (options?.requireNew && fs.existsSync(worktreePath)) {
      throw createValidationError(`A directory already exists at ${worktreePath}. Choose another worktree location.`)
    }
    const ownership = await getWorktreeOwnership(projectPath, worktreePath)
    if (ownership.kind === 'different-project') {
      throw createForeignWorktreeError(worktreePath)
    }
    if (ownership.kind === 'current-project') {
      return success({
        worktreePath,
        branchName,
      })
    } // Reusing an existing branch checks it out without forking from main.
    const branchList = await commands.execute('agent-worktree.branch.local-list', projectPath, {
      branch: branchName,
    })
    if (branchList.trim()) {
      if (options?.requireNew)
        throw createValidationError(`Branch '${branchName}' already exists. Add the worktree again to choose a new name.`)
      await releaseBranchFromOtherWorktree(projectPath, worktreePath, branchName)
      await commands.execute('agent-worktree.add-existing', projectPath, {
        worktreePath,
        branch: branchName,
      })
      return success({
        worktreePath,
        branchName,
      })
    } // Forking a new worktree from main: only now does main's state matter.
    if (!options?.skipDirtyCheck) {
      const status = await commands.execute('agent-worktree.main.status', projectPath)
      if (status.trim()) {
        return failure({
          dirtyWorktree: true,
        })
      }
    }
    let behindRemote = false
    try {
      const behindCount = await commands.execute('agent-worktree.behind-upstream.count', projectPath, {
        range: `${mainBranch}..${mainBranch}@{upstream}`,
      })
      if (parseInt(behindCount.trim(), 10) > 0) {
        behindRemote = true
      }
    } catch (e) {
      console.warn('Skipping upstream check:', e instanceof Error ? e.message : e)
    }
    await commands.execute('agent-worktree.create', projectPath, {
      branch: branchName,
      worktreePath,
      mainBranch,
    })
    return success(
      behindRemote
        ? {
            worktreePath,
            branchName,
            behindRemote,
          }
        : {
            worktreePath,
            branchName,
          },
    )
  }

  async function isWorktreeClean(worktreePath: string): Promise<boolean> {
    const status = await commands.execute('agent-worktree.status', worktreePath)
    return !status.trim()
  }

  function isGitWorktree(worktreePath: string): boolean {
    return repository.isWorktree(worktreePath)
  }

  async function getWorktreeOwnership(projectPath: string, worktreePath: string): Promise<WorktreeOwnership> {
    if (!repository.isWorktree(worktreePath))
      return {
        kind: 'not-worktree',
      }
    return (await repository.isSameRepository(projectPath, worktreePath))
      ? {
          kind: 'current-project',
        }
      : {
          kind: 'different-project',
        }
  }

  async function hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean> {
    try {
      const output = await commands.execute('agent-worktree.remote-branch.probe', projectPath, {
        branch: branchName,
      })
      return output.trim().length > 0
    } catch {
      return false
    }
  }

  async function isWorktreeBusy(worktreePath: string): Promise<boolean> {
    if (process.platform === 'win32') {
      const probe = worktreePath + '.busy-probe'
      try {
        await rename(worktreePath, probe)
        await rename(probe, worktreePath)
        return false
      } catch (e: any) {
        if (e.code === 'ENOENT') return false
        return true
      }
    }
    const key = process.platform === 'darwin' ? 'agent-worktree.busy.probe.macos' : 'agent-worktree.busy.probe.linux'
    try {
      const stdout = await commands.execute(key, worktreePath, {
        worktreePath,
      })
      const lines = stdout.split('\n').filter((line) => line.trim() && !line.startsWith('COMMAND'))
      return lines.length > 0
    } catch (error) {
      // lsof exits non-zero when it finds nothing open, which is the answer
      // "not busy". A probe that never ran is not an answer, so say so rather
      // than reporting a directory as free because the tool was missing.
      if (!(isProcessError(error) && error.kind === 'exited')) {
        appLog('worktree', `busy probe unavailable for ${worktreePath}: ${errorMessage(error)}`)
      }
      return false
    }
  }

  async function findLockingProcesses(worktreePath: string): Promise<LockingProcessInfo[]> {
    if (process.platform === 'win32') {
      const scriptPath = path.join(launcherConfig.getConfigDefaultsDir(), 'find-locking-processes.ps1')
      const normalizedPath = worktreePath.replace(/\//g, '\\')
      const stdout = await commands.execute('agent-worktree.locking-processes.windows', normalizedPath, {
        scriptPath,
        worktreePath: normalizedPath,
      })
      return parseTabSeparatedProcesses(stdout)
    }
    const key = process.platform === 'darwin' ? 'agent-worktree.busy.probe.macos' : 'agent-worktree.busy.probe.linux'
    try {
      const stdout = await commands.execute(key, worktreePath, {
        worktreePath,
      })
      return parseLsofProcesses(stdout)
    } catch (error) {
      // lsof exits non-zero when nothing is open, which means "no holders".
      if (isProcessError(error) && error.kind === 'exited') return []
      throw error
    }
  }

  async function resolveRemote(projectPath: string, branchName: string): Promise<string> {
    try {
      const remote = (
        await commands.execute('agent-worktree.branch.remote', projectPath, {
          configKey: `branch.${branchName}.remote`,
        })
      ).trim()
      if (remote) return remote
    } catch {}
    return 'origin'
  }

  async function releaseBranchFromOtherWorktree(projectPath: string, targetWorktreePath: string, branchName: string): Promise<void> {
    await commands.execute('agent-worktree.prune', projectPath)
    const existing = await worktreePathForBranch(projectPath, branchName)
    if (existing && !pathsReferToSameEntry(existing, targetWorktreePath)) {
      throw new Error(
        `Branch '${branchName}' is already checked out at ${existing}.` +
          ` Remove that worktree first (git worktree remove "${existing}").`,
      )
    }
  }

  async function worktreePathForBranch(projectPath: string, branchName: string): Promise<string | undefined> {
    const out = await commands.execute('agent-worktree.list', projectPath)
    let currentPath: string | undefined
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim()
      else if (line.trim() === `branch refs/heads/${branchName}` && currentPath) return currentPath
    }
    return undefined
  }

  async function localBranchExists(projectPath: string, branchName: string): Promise<boolean> {
    return commands
      .execute('agent-worktree.local-branch.probe', projectPath, {
        ref: `refs/heads/${branchName}`,
      })
      .then(
        () => true,
        () => false,
      )
  }

  async function isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean> {
    if (!(await localBranchExists(projectPath, branchName))) {
      throw createValidationError(
        `Branch '${branchName}' no longer exists.` +
          ' It may have been renamed or deleted outside Context & Launch.' +
          ' Archive without deleting the branch, or update the task to point at the current branch.',
      )
    }
    const mainBranch = await getMainBranch(projectPath, configuredBranch)
    if (await isBranchIntegrated(projectPath, branchName, mainBranch)) return true
    const remoteRef = await fetchMainBranch(projectPath, mainBranch)
    return remoteRef ? isBranchIntegrated(projectPath, branchName, remoteRef) : false
  }

  async function fetchMainBranch(projectPath: string, mainBranch: string): Promise<string | null> {
    const hasRemote = await commands.execute('agent-worktree.remote.list', projectPath).then(
      (out) => out.trim().length > 0,
      () => false,
    )
    if (!hasRemote) return null
    const remote = await resolveRemote(projectPath, mainBranch)
    await commands.execute('agent-worktree.main.fetch', projectPath, {
      remote,
      mainBranch,
    })
    return `${remote}/${mainBranch}`
  }

  async function isBranchIntegrated(projectPath: string, branchName: string, mainBranch: string): Promise<boolean> {
    const isAncestor = await commands
      .execute('agent-worktree.merged.probe', projectPath, {
        branch: branchName,
        mainBranch,
      })
      .then(
        () => true,
        () => false,
      )
    if (isAncestor) return true
    const mainTree = (
      await commands.execute('agent-worktree.main-tree', projectPath, {
        treeRef: `${mainBranch}^{tree}`,
      })
    ).trim()
    if (await isBranchContentIntegrated(projectPath, branchName, mainBranch, mainTree)) return true
    const history = await commands.execute('agent-worktree.main-history', projectPath, {
      range: `${branchName}..${mainBranch}`,
    })
    for (const line of history.trim().split('\n')) {
      if (!line.trim()) continue
      const [commit, tree] = line.trim().split(' ')
      if (!commit || !tree) throw new Error('Git returned an invalid main branch history entry')
      if (await isBranchContentIntegrated(projectPath, branchName, commit, tree)) return true
    }
    return false
  }

  async function isBranchContentIntegrated(
    projectPath: string,
    branchName: string,
    targetRef: string,
    targetTree: string,
  ): Promise<boolean> {
    const result = await writeMergeTree(commands, 'agent-worktree.merge-tree', projectPath, {
      mainBranch: targetRef,
      branch: branchName,
    })
    return result.status === 'clean' && result.tree === targetTree
  }

  async function removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    if (fs.existsSync(worktreePath) && !isGitWorktree(worktreePath)) {
      fs.rmSync(worktreePath, {
        recursive: true,
        force: true,
      })
      await commands.execute('agent-worktree.prune', projectPath)
      return
    }
    try {
      await commands.execute('agent-worktree.remove', projectPath, {
        worktreePath,
      })
    } catch (error) {
      // A worktree whose directory is already gone leaves only a stale
      // registration, and pruning completes the removal. When the directory is
      // still on disk git refused for a reason -- a lock, open files, or
      // uncommitted state -- so deleting it anyway would destroy work the user
      // can still recover. Report why instead.
      if (fs.existsSync(worktreePath)) throw error
      await commands.execute('agent-worktree.prune', projectPath)
    }
  }

  async function deleteLocalBranch(projectPath: string, branchName: string, configuredBranch?: string): Promise<void> {
    const merged = await isBranchMerged(projectPath, branchName, configuredBranch)
    if (!merged) {
      throw new Error(`Branch '${branchName}' has unmerged commits.` + ' Merge or force-delete the branch before cleanup.')
    }
    await commands.execute('agent-worktree.branch.delete-local', projectPath, {
      branch: branchName,
    })
  }

  async function forceDeleteLocalBranch(projectPath: string, branchName: string): Promise<void> {
    await commands.execute('agent-worktree.branch.delete-local', projectPath, {
      branch: branchName,
    })
  }

  async function deleteRemoteBranch(projectPath: string, branchName: string): Promise<void> {
    await commands.execute('agent-worktree.branch.delete-remote', projectPath, {
      branch: branchName,
    })
  }

  return {
    getMainBranch,
    ensureAgentWorktree,
    isWorktreeClean,
    isGitWorktree,
    getWorktreeOwnership,
    hasRemoteBranch,
    isWorktreeBusy,
    findLockingProcesses,
    localBranchExists,
    worktreePathForBranch,
    isBranchMerged,
    removeWorktree,
    deleteLocalBranch,
    forceDeleteLocalBranch,
    deleteRemoteBranch,
  }
}
