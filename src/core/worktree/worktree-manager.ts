import fs from 'fs'
import path from 'path'
import type { ConfigPaths } from '../config/config-paths.js'
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'

export interface WorktreeManager {
  ensureWorktree(projectPath: string, projectSlug: string, branch?: string): Promise<string>
  getWorktreeDir(projectSlug: string): string
}

export function createWorktreeManager(
  paths: ConfigPaths,
  commands: CommandTemplateExecutor,
  ticketsDirResolver?: (projectSlug: string) => string | undefined,
): WorktreeManager {
  const locks = new Map<string, Promise<unknown>>()

  function resolveTicketsDir(projectSlug: string): string {
    return ticketsDirResolver?.(projectSlug) || paths.ticketWorktreeDir(projectSlug)
  }

  async function ensureWorktree(projectPath: string, projectSlug: string, branch: string = 'tickets'): Promise<string> {
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`)
    }
    const canonicalPath = fs.realpathSync(projectPath)
    const lockKey = canonicalPath
    const prev = locks.get(lockKey) ?? Promise.resolve()
    const next = prev.then(
      () => doEnsureWorktree(canonicalPath, projectSlug, branch),
      () => doEnsureWorktree(canonicalPath, projectSlug, branch),
    )
    locks.set(lockKey, next)
    return next
  }

  async function doEnsureWorktree(projectPath: string, projectSlug: string, branch: string): Promise<string> {
    const worktreeDir = resolveTicketsDir(projectSlug)
    if (fs.existsSync(worktreeDir) && isValidWorktree(worktreeDir)) {
      return worktreeDir
    }
    if (fs.existsSync(worktreeDir)) {
      throw new Error(
        `Worktree directory exists but has invalid git metadata: ${worktreeDir}.` + ` Inspect and remove it manually, then try again.`,
      )
    }
    fs.mkdirSync(path.dirname(worktreeDir), {
      recursive: true,
    })
    const localList = await commands.execute('worktree.branch.local-list', projectPath, {
      branch,
    })
    if (localList.trim().length > 0) {
      await releaseBranchWorktree(projectPath, worktreeDir, branch)
      await commands.execute('worktree.add-existing', projectPath, {
        worktreeDir,
        branch,
      })
      return worktreeDir
    }
    if (await tryAdoptRemoteBranch(projectPath, worktreeDir, branch)) {
      return worktreeDir
    }
    await commands.execute('worktree.create-orphan', projectPath, {
      worktreeDir,
      branch,
      message: `init ${branch}`,
    })
    return worktreeDir
  }

  async function tryAdoptRemoteBranch(projectPath: string, worktreeDir: string, branch: string): Promise<boolean> {
    const remote = await defaultRemote(projectPath)
    if (!remote) return false
    try {
      const remoteHeads = await commands.execute('worktree.remote-branch.probe', projectPath, {
        remote,
        branch,
      })
      if (remoteHeads.trim().length === 0) return false
      await commands.execute('worktree.adopt-remote', projectPath, {
        remote,
        branch,
        worktreeDir,
        remoteBranch: `${remote}/${branch}`,
      })
      return true
    } catch (err) {
      console.warn(`Could not adopt ${remote}/${branch}; creating a local orphan branch instead:`, err)
      return false
    }
  }

  async function releaseBranchWorktree(projectPath: string, worktreeDir: string, branch: string): Promise<void> {
    await commands.execute('worktree.prune', projectPath)
    const existing = await worktreePathForBranch(projectPath, branch)
    if (existing && path.resolve(existing) !== path.resolve(worktreeDir)) {
      throw new Error(
        `Branch '${branch}' is already checked out at ${existing}.` +
          ` Remove that worktree first (git worktree remove "${existing}"), then try again.`,
      )
    }
  }

  async function worktreePathForBranch(projectPath: string, branch: string): Promise<string | null> {
    const out = await commands.execute('worktree.list', projectPath)
    let currentPath: string | null = null
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim()
      else if (line.trim() === `branch refs/heads/${branch}` && currentPath) return currentPath
    }
    return null
  }

  async function defaultRemote(projectPath: string): Promise<string | null> {
    const out = await commands.execute('worktree.remote.list', projectPath)
    const remotes = out
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
    if (remotes.includes('origin')) return 'origin'
    return remotes[0] ?? null
  }

  function getWorktreeDir(projectSlug: string): string {
    return resolveTicketsDir(projectSlug)
  }

  function isValidWorktree(dir: string): boolean {
    const dotGit = path.join(dir, '.git')
    if (!fs.existsSync(dotGit)) return false
    const stat = fs.statSync(dotGit)
    if (!stat.isFile()) return false
    const content = fs.readFileSync(dotGit, 'utf-8').trim()
    const gitDir = content.replace(/^gitdir:\s*/, '')
    const resolved = path.resolve(dir, gitDir)
    if (!fs.existsSync(resolved)) return false
    return headResolves(resolved)
  }

  function headResolves(gitDir: string): boolean {
    const headPath = path.join(gitDir, 'HEAD')
    if (!fs.existsSync(headPath)) return false
    const head = fs.readFileSync(headPath, 'utf-8').trim()
    if (!head.startsWith('ref: ')) {
      return true
    }
    const ref = head.slice(5)
    const commondirPath = path.join(gitDir, 'commondir')
    const commondir = fs.existsSync(commondirPath) ? path.resolve(gitDir, fs.readFileSync(commondirPath, 'utf-8').trim()) : gitDir
    if (fs.existsSync(path.join(commondir, ref))) return true
    const packedRefsPath = path.join(commondir, 'packed-refs')
    if (fs.existsSync(packedRefsPath)) {
      const packedRefs = fs.readFileSync(packedRefsPath, 'utf-8')
      if (packedRefs.includes(` ${ref}\n`) || packedRefs.includes(`\t${ref}\n`)) {
        return true
      }
    }
    return false
  }

  return {
    ensureWorktree,
    getWorktreeDir,
  }
}
