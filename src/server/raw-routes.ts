import 'server-only'
import fs from 'node:fs'
import { worktreeManager, projectRegistry, fileWatcher } from '../core/config/instances.js'
import { createNotFoundError } from '../core/shared/errors.js'
import { createTaskStore } from '../core/task/task-store.js'
import { createRawRouteHandler } from './raw-route-handler.js'

export const handleRawRoute = createRawRouteHandler({
  getWorktreeDir: (projectSlug) => worktreeManager.getWorktreeDir(projectSlug),
  createTaskStore: (worktreeDir) => createTaskStore(worktreeDir),
  subscribeProject: (projectSlug) => {
    const project = projectRegistry.listProjects().find((entry) => entry.projectSlug === projectSlug)
    if (!project?.available) throw createNotFoundError(`Project unavailable: ${projectSlug}`)
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    if (!fs.statSync(worktreeDir).isDirectory()) throw createNotFoundError(`Worktree directory not found: ${worktreeDir}`)
    return fileWatcher.subscribe(worktreeDir)
  },
})
