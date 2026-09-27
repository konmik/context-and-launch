import 'server-only'
import { worktreeManager } from '../core/config/instances.js'
import { createTicketStore } from '../core/ticket/ticket-store.js'
import { createRawRouteHandler } from './raw-route-handler.js'

export const handleRawRoute = createRawRouteHandler({
  getWorktreeDir: (projectSlug) => worktreeManager.getWorktreeDir(projectSlug),
  createTicketStore: (worktreeDir) => createTicketStore(worktreeDir),
})
