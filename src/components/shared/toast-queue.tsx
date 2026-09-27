import type { JSX } from '@solidjs/web'
import { createContext, createSignal, For, useContext } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import ErrorToast from './ErrorToast.js'

interface ToastEntry {
  error: UserFacingError
}

export interface ToastQueueCommands {
  enqueue(error: UserFacingError): void
}

export const ToastQueueContext = createContext<ToastQueueCommands>()

export function useToastQueue(): ToastQueueCommands {
  const commands = useContext(ToastQueueContext)
  if (!commands) throw new Error('useToastQueue requires ToastQueueRoot')
  return commands
}

export function ToastQueueRoot(props: { children: JSX.Element }): JSX.Element {
  const [queue, setQueue] = createSignal<readonly ToastEntry[]>([])
  const commands: ToastQueueCommands = {
    enqueue(error) {
      setQueue((current) => [...current, { error }])
    },
  }

  return (
    <ToastQueueContext value={commands}>
      {props.children}
      <For each={queue().slice(0, 1)}>
        {(entry) => <ErrorToast error={entry.error} onClose={() => setQueue((current) => current.filter((item) => item !== entry))} />}
      </For>
    </ToastQueueContext>
  )
}
