import type { JSX } from '@solidjs/web'
import { createSignal, createEffect, onCleanup } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import ErrorDialog from './ErrorDialog.js'
import { useToastQueue } from './toast-queue.js'
import type { ErrorPresentationCommands } from './error-presentation.js'
import { ErrorPresentationContext } from './error-presentation.js'

export function ErrorScope(props: { active: boolean; children: JSX.Element }): JSX.Element {
  const toasts = useToastQueue()
  const [dialogs, setDialogs] = createSignal<UserFacingError[]>([])
  const fields = new Map<string, (error?: UserFacingError) => void>()
  let mounted = true
  onCleanup(() => {
    mounted = false
  })
  const commands: ErrorPresentationCommands = {
    report(error) {
      if (!mounted || !props.active) {
        toasts.enqueue(error)
        return
      }
      const show = error.field ? fields.get(error.field) : undefined
      if (show) show(error)
      else setDialogs((current) => [...current, error])
    },
    clear() {
      setDialogs([])
      for (const show of fields.values()) show(undefined)
    },
    register(field, show): () => void {
      if (fields.has(field)) throw new Error(`Error field '${field}' is already registered in this form`)
      fields.set(field, show)
      return () => fields.delete(field)
    },
  }
  createEffect(
    () => props.active,
    (active) => {
      if (!active) commands.clear()
    },
  )
  return (
    <ErrorPresentationContext value={commands}>
      {props.children}
      <ErrorDialog error={props.active ? dialogs()[0] : undefined} onClose={() => setDialogs((current) => current.slice(1))} />
    </ErrorPresentationContext>
  )
}
