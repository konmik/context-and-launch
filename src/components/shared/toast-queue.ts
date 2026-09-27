import { createContext, useContext } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export interface ToastQueueCommands {
  enqueue(error: UserFacingError): void
}

export const ToastQueueContext = createContext<ToastQueueCommands>()

export function useToastQueue(): ToastQueueCommands {
  const commands = useContext(ToastQueueContext)
  if (!commands) throw new Error('useToastQueue requires ToastQueueRoot')
  return commands
}
