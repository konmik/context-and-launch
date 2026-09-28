import fs from 'fs'
import path from 'path'
import { createAppError, isProcessError } from '../shared/errors.js'
import { writeMergeTree } from '../infra/git-merge-tree.js'
import { type GitRepository } from '../infra/git-repository.js'
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'
import { success, failure, type Result } from '../../util/result.js'

export interface SuccessSyncResult {
  status: 'success'
}

export interface ConflictSyncResult {
  status: 'conflict'
}

export interface ResolutionPlan {
  /** True when conflicts remain and an agent must resolve them in `scratchDir`. */
  needsAgent: boolean
  /** The scratch worktree the agent runs in; never the live tasks folder. */
  scratchDir: string
  /** Exact push command for the agent once the rebase completes. */
  pushCommand: string
}

type ResolutionScratchState = 'absent' | 'linked' | 'orphaned'

export interface TaskSyncManager {
  hasRemote(worktreeDir: string): Promise<boolean>
  detectConflict(worktreeDir: string): Promise<boolean>
  sync(worktreeDir: string): Promise<Result<SuccessSyncResult | ConflictSyncResult, string>>
  prepareResolution(worktreeDir: string): Promise<ResolutionPlan>
  finalizeResolution(worktreeDir: string): Promise<boolean>
  isResolving(worktreeDir: string): boolean
  abort(worktreeDir: string): Promise<void>
  hasActiveRebase(worktreeDir: string): boolean
}

export function createTaskSyncManager(commands: CommandTemplateExecutor, gitRepo: GitRepository): TaskSyncManager {
  async function hasRemote(worktreeDir: string): Promise<boolean> {
    const remotes = (await commands.execute('task-sync.remote.list', worktreeDir)).trim()
    return remotes.length > 0
  }

  async function detectConflict(worktreeDir: string): Promise<boolean> {
    const scratch = conflictResolveDir(worktreeDir)
    const scratchState = resolutionScratchState(scratch)
    if (scratchState === 'linked') {
      return gitRepo.hasActiveRebase(scratch)
    }
    if (scratchState === 'orphaned') discardOrphanedResolutionScratch(scratch)
    if (gitRepo.hasActiveRebase(worktreeDir)) return true
    let upstream: string
    try {
      upstream = (await commands.execute('task-sync.upstream.resolve', worktreeDir)).trim()
    } catch (error) {
      const hasNoUpstream = isProcessError(error) && /no upstream configured/.test(error.output ?? '')
      if (hasNoUpstream) return false
      throw error
    }
    const localHead = await resolveHead(worktreeDir)
    const upstreamHead = await resolveRef(worktreeDir, upstream)
    if (localHead === upstreamHead) return false
    if (await isAncestor(worktreeDir, localHead, upstreamHead)) return false
    if (await isAncestor(worktreeDir, upstreamHead, localHead)) return false
    await gitRepo.assertSupportsMergeTree(worktreeDir)
    const mergeTree = await writeMergeTree(commands, 'task-sync.merge-tree', worktreeDir, {
      left: localHead,
      right: upstreamHead,
    })
    return mergeTree.status === 'conflicted'
  }

  async function sync(worktreeDir: string): Promise<Result<SuccessSyncResult | ConflictSyncResult, string>> {
    try {
      const scratch = conflictResolveDir(worktreeDir)
      const scratchState = resolutionScratchState(scratch)
      if (scratchState === 'linked') {
        const finalized = await finalizeResolution(worktreeDir)
        if (!finalized && resolutionScratchState(scratch) === 'linked') {
          return success({
            status: 'conflict',
          })
        }
      } else if (scratchState === 'orphaned') {
        discardOrphanedResolutionScratch(scratch)
      }
      if (gitRepo.hasActiveRebase(worktreeDir)) {
        return success({
          status: 'conflict',
        })
      }
      await commitAll(worktreeDir)
      let upstream: string
      try {
        upstream = (await commands.execute('task-sync.upstream.resolve', worktreeDir)).trim()
      } catch (err) {
        const isNoUpstream = isProcessError(err) && /no upstream configured/.test(err.output ?? '')
        if (!isNoUpstream) throw err
        const branch = (await commands.execute('task-sync.branch.current', worktreeDir)).trim()
        try {
          await commands.execute('task-sync.push.set-upstream', worktreeDir, {
            remote: 'origin',
            branch,
          })
          return success({
            status: 'success',
          })
        } catch (pushErr) {
          const isNonFastForward = isProcessError(pushErr) && /non-fast-forward|fetch first/.test(pushErr.output ?? '')
          if (!isNonFastForward) throw pushErr
          await commands.execute('task-sync.fetch-origin', worktreeDir)
          await commitAll(worktreeDir)
          const localHead = await resolveHead(worktreeDir)
          upstream = `origin/${branch}`
          await commands.execute('task-sync.upstream.repair', worktreeDir, {
            remoteBranch: upstream,
            localHead,
            upstream,
          })
        }
      }
      await gitRepo.assertSupportsMergeTree(worktreeDir)
      const [baseUpstream, squashBase] = await Promise.all([
        resolveRef(worktreeDir, upstream),
        resolveMergeBase(worktreeDir, 'HEAD', upstream),
      ])
      if ((await countAheadOf(worktreeDir, squashBase)) > 1) {
        await commands.execute('task-sync.reset-soft', worktreeDir, {
          ref: squashBase,
        })
        await commitAll(worktreeDir)
      }
      await commands.execute('task-sync.fetch', worktreeDir)
      await commitAll(worktreeDir)
      const [headLocal, newUpstream, aheadCount] = await Promise.all([
        resolveHead(worktreeDir),
        resolveRef(worktreeDir, upstream),
        countAheadOf(worktreeDir, baseUpstream),
      ])
      if (aheadCount === 0) {
        if (headLocal !== newUpstream) {
          await commands.execute('task-sync.fast-forward', worktreeDir, {
            ref: newUpstream,
          })
        }
        return success({
          status: 'success',
        })
      }
      const { remote, branch } = parseUpstream(upstream)
      if (await isAncestor(worktreeDir, newUpstream, 'HEAD')) {
        try {
          await commands.execute('task-sync.push', worktreeDir, {
            remote,
            refspec: `HEAD:${branch}`,
          })
        } catch (pushErr) {
          return failure(pushErr instanceof Error ? pushErr.message : String(pushErr))
        }
        return success({
          status: 'success',
        })
      }
      const mergeTree = await writeMergeTree(commands, 'task-sync.merge-tree', worktreeDir, {
        left: 'HEAD',
        right: newUpstream,
      })
      if (mergeTree.status === 'conflicted')
        return success({
          status: 'conflict',
        })
      const mergedTree = mergeTree.tree
      const signArgs = await commitTreeArgs(worktreeDir)
      const newCommit = (
        await commands.execute(
          'task-sync.commit-tree',
          worktreeDir,
          {
            tree: mergedTree,
            parent: newUpstream,
            message: 'sync: local changes',
          },
          {
            signArgs,
          },
        )
      ).trim()
      try {
        await commands.execute('task-sync.push', worktreeDir, {
          remote,
          refspec: `${newCommit}:${branch}`,
        })
      } catch (pushErr) {
        return failure(pushErr instanceof Error ? pushErr.message : String(pushErr))
      }
      await commitAll(worktreeDir)
      const headAfterPush = await resolveHead(worktreeDir)
      if (headAfterPush !== headLocal) {
        return success({
          status: 'conflict',
        })
      }
      await commands.execute('task-sync.reset-hard', worktreeDir, {
        ref: newCommit,
      })
      return success({
        status: 'success',
      })
    } catch (err) {
      return failure(err instanceof Error ? err.message : String(err))
    }
  }

  async function commitAll(worktreeDir: string): Promise<void> {
    await commands.execute('git.stage-all', worktreeDir)
    const staged = await commands.execute('task-sync.staged-files', worktreeDir)
    if (staged.trim()) {
      await assertNoConflictMarkers(worktreeDir)
      await commands.execute('git.commit', worktreeDir, {
        message: 'sync: local changes',
      })
    }
  }

  async function isAncestor(worktreeDir: string, ancestor: string, descendant: string): Promise<boolean> {
    try {
      await commands.execute('task-sync.ancestor.probe', worktreeDir, {
        ancestor,
        descendant,
      })
      return true
    } catch (err) {
      if (isProcessError(err) && err.exitedWith(1)) return false
      throw err
    }
  }

  async function countAheadOf(worktreeDir: string, baseCommit: string): Promise<number> {
    return parseInt(
      (
        await commands.execute('task-sync.ahead-count', worktreeDir, {
          range: `${baseCommit}..HEAD`,
        })
      ).trim(),
      10,
    )
  }

  async function assertNoConflictMarkers(worktreeDir: string): Promise<void> {
    try {
      await commands.execute('task-sync.conflict-marker.probe', worktreeDir)
    } catch (err) {
      if (!isProcessError(err)) throw err // `git diff --check` also fails on benign whitespace errors; only block on
      // leftover conflict markers, which must never be committed.
      if (/conflict marker/i.test(err.output ?? '')) {
        throw new Error(
          'Refusing to commit unresolved conflict markers. Resolve the conflict in the ' + 'tasks repository, then sync again.',
        )
      }
    }
  }

  async function prepareResolution(worktreeDir: string): Promise<ResolutionPlan> {
    const scratch = conflictResolveDir(worktreeDir)
    const upstream = (await commands.execute('conflict-resolution.upstream.resolve', worktreeDir)).trim()
    const { remote, branch } = parseUpstream(upstream)
    const pushCommand = commands.render('conflict-resolution.push', {
      remote,
      refspec: `HEAD:${branch}`,
    })
    let scratchState = resolutionScratchState(scratch)
    if (scratchState === 'orphaned') {
      if (!discardOrphanedResolutionScratch(scratch)) {
        throw createAppError(
          `Cannot prepare conflict resolution while ${scratch} is in use. ` +
            'Close the previous conflict-resolution terminal and try again.',
        )
      }
      scratchState = 'absent'
    }
    if (scratchState === 'absent') {
      await commands.execute('conflict-resolution.scratch.create', worktreeDir, {
        scratch,
        ref: 'HEAD',
      })
    }
    await commands.execute('conflict-resolution.fetch', worktreeDir)
    if (!gitRepo.hasActiveRebase(scratch)) {
      try {
        await commands.execute('conflict-resolution.rebase', scratch, {
          upstream,
        })
      } catch (err) {
        // A conflict leaves a rebase in progress; anything else is a real failure.
        if (!gitRepo.hasActiveRebase(scratch)) {
          await removeResolveWorktree(worktreeDir, scratch)
          throw err
        }
      }
    }
    if (!gitRepo.hasActiveRebase(scratch)) {
      await commands.execute('conflict-resolution.push', scratch, {
        remote,
        refspec: `HEAD:${branch}`,
      })
      await finalizeResolution(worktreeDir)
      return {
        needsAgent: false,
        scratchDir: scratch,
        pushCommand,
      }
    }
    return {
      needsAgent: true,
      scratchDir: scratch,
      pushCommand,
    }
  }

  async function finalizeResolution(worktreeDir: string): Promise<boolean> {
    const scratch = conflictResolveDir(worktreeDir)
    const scratchState = resolutionScratchState(scratch)
    if (scratchState === 'absent') return false
    if (scratchState === 'orphaned') {
      discardOrphanedResolutionScratch(scratch)
      return false
    }
    if (gitRepo.hasActiveRebase(scratch)) return false
    const upstream = (await commands.execute('conflict-resolution.upstream.resolve', worktreeDir)).trim()
    try {
      await commands.execute('conflict-resolution.fetch', worktreeDir)
    } catch (err) {
      console.warn('Skipping conflict finalize check: fetch failed:', err instanceof Error ? err.message : err)
      return false
    }
    const scratchHead = (await commands.execute('conflict-resolution.head.resolve', scratch)).trim()
    let upstreamHead = await resolveRef(worktreeDir, upstream)
    if (scratchHead !== upstreamHead) return false
    await commitAll(worktreeDir)
    const headLocal = (await commands.execute('conflict-resolution.head.resolve', worktreeDir)).trim()
    if (headLocal !== upstreamHead) {
      const snapshotBase = (await commands.execute('conflict-resolution.snapshot-base.resolve', scratch)).trim()
      if (headLocal !== snapshotBase) {
        try {
          await commands.execute('conflict-resolution.local-changes.rebase', scratch, {
            upstream: upstreamHead,
            snapshotBase,
            localHead: headLocal,
          })
        } catch (err) {
          if (!gitRepo.hasActiveRebase(scratch)) throw err
          return false
        }
        const { remote, branch } = parseUpstream(upstream)
        await commands.execute('conflict-resolution.push', scratch, {
          remote,
          refspec: `HEAD:${branch}`,
        })
        upstreamHead = (await commands.execute('conflict-resolution.head.resolve', scratch)).trim()
      }
    }
    await commitAll(worktreeDir)
    const currentHead = await commands.execute('conflict-resolution.head.resolve', worktreeDir)
    if (currentHead.trim() !== headLocal) return false
    await commands.execute('task-sync.reset-hard', worktreeDir, {
      ref: upstreamHead,
    })
    try {
      await removeResolveWorktree(worktreeDir, scratch)
    } catch (error) {
      // The live Worktree already points at the pushed resolution. Scratch
      // cleanup is a disposable follow-up and must not roll that successful
      // state transition back into a page-load failure. Git for Windows can
      // unregister and empty the scratch before failing to delete its locked
      // directory; repair that partial result when possible and retry later
      // otherwise.
      if (resolutionScratchState(scratch) === 'orphaned') {
        discardOrphanedResolutionScratch(scratch)
      }
      console.warn(`Conflict resolution restored; scratch cleanup deferred for ${scratch}:`, error instanceof Error ? error.message : error)
    }
    return true
  }

  function isResolving(worktreeDir: string): boolean {
    const scratch = conflictResolveDir(worktreeDir)
    return resolutionScratchState(scratch) === 'linked' && gitRepo.hasActiveRebase(scratch)
  }

  async function abort(worktreeDir: string): Promise<void> {
    const scratch = conflictResolveDir(worktreeDir)
    const scratchState = resolutionScratchState(scratch)
    if (scratchState === 'orphaned') {
      if (!discardOrphanedResolutionScratch(scratch)) {
        throw createAppError(
          `Cannot clean up conflict resolution while ${scratch} is in use. ` + 'Close the conflict-resolution terminal and try again.',
        )
      }
      return
    }
    if (scratchState === 'linked') {
      if (gitRepo.hasActiveRebase(scratch)) {
        await commands.execute('conflict-resolution.rebase.abort', scratch)
      }
      await removeResolveWorktree(worktreeDir, scratch)
      return
    } // Recover a stuck legacy rebase left directly in the live tree.
    if (gitRepo.hasActiveRebase(worktreeDir)) {
      await commands.execute('conflict-resolution.rebase.abort', worktreeDir)
    }
  }

  function hasActiveRebase(worktreeDir: string): boolean {
    return gitRepo.hasActiveRebase(worktreeDir)
  }

  async function commitTreeArgs(worktreeDir: string): Promise<string[]> {
    try {
      const val = (await commands.execute('task-sync.gpg-signing.read', worktreeDir)).trim()
      return val === 'true' ? ['-S'] : []
    } catch {
      return []
    }
  }

  function parseUpstream(upstream: string): ParseUpstreamResult {
    const slashIndex = upstream.indexOf('/')
    if (slashIndex === -1)
      return {
        remote: 'origin',
        branch: upstream,
      }
    return {
      remote: upstream.slice(0, slashIndex),
      branch: upstream.slice(slashIndex + 1),
    }
  }

  function conflictResolveDir(worktreeDir: string): string {
    const normalized = worktreeDir.replace(/[\\/]+$/, '')
    return path.join(path.dirname(normalized), `${path.basename(normalized)}-conflict-resolve`)
  }

  function resolutionScratchState(scratch: string): ResolutionScratchState {
    if (!fs.existsSync(scratch)) return 'absent'
    return gitRepo.isWorktree(scratch) ? 'linked' : 'orphaned'
  }

  function discardOrphanedResolutionScratch(scratch: string): boolean {
    try {
      fs.rmSync(scratch, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      })
      return !fs.existsSync(scratch)
    } catch (error) {
      console.warn(`Could not remove orphaned conflict-resolution directory ${scratch}:`, error instanceof Error ? error.message : error)
      return false
    }
  }

  async function resolveRef(worktreeDir: string, ref: string): Promise<string> {
    return (
      await commands.execute('task-sync.ref.resolve', worktreeDir, {
        ref,
      })
    ).trim()
  }

  async function resolveHead(worktreeDir: string): Promise<string> {
    return (await commands.execute('task-sync.head.resolve', worktreeDir)).trim()
  }

  async function resolveMergeBase(worktreeDir: string, left: string, right: string): Promise<string> {
    return (
      await commands.execute('task-sync.merge-base', worktreeDir, {
        left,
        right,
      })
    ).trim()
  }

  async function removeResolveWorktree(worktreeDir: string, scratch: string): Promise<void> {
    await commands.execute('conflict-resolution.scratch.remove', worktreeDir, {
      scratch,
    })
  }

  return {
    hasRemote,
    detectConflict,
    sync,
    prepareResolution,
    finalizeResolution,
    isResolving,
    abort,
    hasActiveRebase,
  }
}

export interface ParseUpstreamResult {
  remote: string
  branch: string
}
