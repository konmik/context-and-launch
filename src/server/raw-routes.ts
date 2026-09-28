import 'server-only'
import { worktreeManager } from '../core/config/instances.js'
import { createTaskStore } from '../core/task/task-store.js'
import { createRawRouteHandler } from './raw-route-handler.js'

export const handleRawRoute = createRawRouteHandler({
  getWorktreeDir: (projectSlug) => worktreeManager.getWorktreeDir(projectSlug),
  createTaskStore: (worktreeDir) => createTaskStore(worktreeDir),
})
