import type { SourceAccessor } from 'solid-js'
import type { Setter } from 'solid-js'
import { createSignal } from 'solid-js'
import { runShortcut as runShortcutAction } from '../launcher/launcher-api.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'

export interface ShortcutDeps {
  projectSlug: () => string
  folderName: () => string
  useWorktree: () => boolean
  launchDir: () => string
  setError: (error: ErrorInfo | null) => void
  runShortcut?: typeof runShortcutAction
}

export interface ShortcutConfirmation {
  name: string
  message: string
  type: 'dirtyWorktree' | 'behindRemote'
}

export function createShortcutState(deps: ShortcutDeps): ShortcutStateResult {
  const [runningShortcut, setRunningShortcut] = createSignal('')
  const [shortcutConfirmation, setShortcutConfirmation] = createSignal<ShortcutConfirmation>()

  async function runShortcut(name: string, force?: boolean) {
    setRunningShortcut(name)
    deps.setError(null)
    try {
      const result = await (deps.runShortcut ?? runShortcutAction)(
        deps.projectSlug(),
        deps.folderName(),
        name,
        deps.useWorktree(),
        force ?? false,
        deps.launchDir(),
      )
      if (result.type === 'Failure') {
        if (result.error.type === 'dirtyWorktree' || result.error.type === 'behindRemote') {
          setShortcutConfirmation({
            name,
            message: result.error.message,
            type: result.error.type,
          })
          return
        }
        if (result.error.type === 'error') {
          deps.setError({
            ...result.error.errorInfo,
            title: 'Shortcut failed',
          })
        } else {
          deps.setError({
            title: 'Shortcut failed',
            description: result.error.message,
          })
        }
      }
    } catch (e: unknown) {
      deps.setError(errorPayload(e, 'Shortcut failed'))
    } finally {
      setRunningShortcut('')
    }
  }

  return {
    runningShortcut,
    shortcutConfirmation,
    setShortcutConfirmation,
    runShortcut,
  }
}

export interface ShortcutStateResult {
  runningShortcut: SourceAccessor<string>
  shortcutConfirmation: SourceAccessor<ShortcutConfirmation | undefined>
  setShortcutConfirmation: Setter<ShortcutConfirmation | undefined>
  runShortcut: (name: string, force?: boolean) => Promise<void>
}
