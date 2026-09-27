import type { JSX } from '@solidjs/web'
import { createContext, createSignal, createEffect, onCleanup, Show, useContext } from 'solid-js'
import { errorPayload } from '~/core/shared/errors.js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import ErrorDialog from './ErrorDialog.js'
import { useToastQueue } from './toast-queue.js'

interface ErrorPresentationCommands {
  report(error: UserFacingError): void
  clear(): void
  register(field: string, show: (error?: UserFacingError) => void): () => void
}

interface ErrorReporter {
  report(error: UserFacingError): void
  background(error: UserFacingError): void
  clear(): void
  run(operation: () => Promise<Result<unknown, UserFacingError>>, background?: boolean): Promise<void>
}

const ErrorPresentationContext = createContext<ErrorPresentationCommands>()

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
  createEffect(() => props.active, (active) => {
    if (!active) commands.clear()
  })
  return (
    <ErrorPresentationContext value={commands}>
      {props.children}
      <ErrorDialog error={props.active ? dialogs()[0] : undefined} onClose={() => setDialogs((current) => current.slice(1))} />
    </ErrorPresentationContext>
  )
}

export function useErrorReporter(active: () => boolean = () => true): ErrorReporter {
  const scope = useContext(ErrorPresentationContext)
  const toasts = useToastQueue()
  let mounted = true
  onCleanup(() => {
    mounted = false
  })
  function report(error: UserFacingError) {
    if (mounted && active()) scope.report(error)
    else toasts.enqueue(error)
  }
  return {
    report,
    background: toasts.enqueue,
    clear() {
      scope.clear()
    },
    async run(operation, background = false) {
      const show = background ? toasts.enqueue : report
      try {
        const result = await operation()
        if (result.type === 'Failure') show(result.error)
      } catch (error) {
        show(errorPayload(error))
      }
    },
  }
}

export function useErrorSink(active: () => boolean = () => true, background = false): (error?: UserFacingError | null) => void {
  const errors = useErrorReporter(active)
  return (error) => {
    if (!error) {
      if (!background) errors.clear()
    } else if (background) errors.background(error)
    else errors.report(error)
  }
}

export function ErrorField(props: { field: string }): JSX.Element {
  const scope = useContext(ErrorPresentationContext)
  const [error, setError] = createSignal<UserFacingError>()
  onCleanup(scope.register(props.field, setError))
  return <FieldErrorMessage error={error()} />
}

export function FieldErrorMessage(props: { error?: UserFacingError }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false)
  return (
    <>
      <Show when={props.error}>
        {(current) => (
          <div class="mt-1 flex items-start gap-2 text-sm text-destructive" role="alert">
            <p class="whitespace-pre-wrap">{current().description}</p>
            <button type="button" class="btn-icon shrink-0" aria-label="Error details" onClick={() => setExpanded(true)}>
              ?
            </button>
          </div>
        )}
      </Show>
      <ErrorDialog error={expanded() ? props.error : undefined} onClose={() => setExpanded(false)} />
    </>
  )
}
