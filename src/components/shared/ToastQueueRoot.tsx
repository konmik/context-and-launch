import type { JSX } from '@solidjs/web'
import { createSignal, For } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import ErrorToast from './ErrorToast.js'
import type { ToastQueueCommands } from './toast-queue.js'
import { ToastQueueContext } from './toast-queue.js'

interface ToastEntry {
  error: UserFacingError
}

export function ToastQueueRoot(props: { children: JSX.Element }): JSX.Element {
  const [queue, setQueue] = createSignal<readonly ToastEntry[]>([])
  const commands: ToastQueueCommands = {
    enqueue(error) {
      setQueue((current) => [
        ...current,
        {
          error,
        },
      ])
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
