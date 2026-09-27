import type { SourceAccessor } from 'solid-js'
import type { LauncherProfile } from '../../core/launcher/launcher-config-data.js'
import type { Setter } from 'solid-js'
import { createSignal, createEffect, createMemo, useContext } from 'solid-js'
import { ProjectLauncherConfigContext } from '../launcher/project-launcher-config-storage.js'
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js'
import { AppConfigContext } from '../config/app-config-storage.js'
import { LauncherConfigContext } from '../launcher/shared-launcher-config-storage.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'

export interface ConflictDialogDeps {
  projectSlug: () => string
  onResolve: (profileName: string) => Promise<void>
  onAbort: () => Promise<void>
  onOpenChange: (open: boolean) => void
  onError: (error: ErrorInfo) => void
}

export function createConflictDialogController(deps: ConflictDialogDeps): ConflictDialogControllerResult {
  const appConfig = useContext(AppConfigContext)!
  const [submitting, setSubmitting] = createSignal(false)
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const profiles = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()).profiles)
  const [selectedProfile, setSelectedProfile] = createSignal('')
  createEffect(
    () => ({
      list: profiles(),
      selected: selectedProfile(),
      preferred: appConfig.get().lastUsedProfileName,
    }),
    ({ list, selected, preferred }) => {
      if (list.some((profile) => profile.name === selected)) return
      setSelectedProfile(list.find((profile) => profile.name === preferred)?.name ?? list[0]?.name ?? '')
    },
  )

  async function selectProfile(name: string) {
    setSelectedProfile(name)
    if (!name) return
    try {
      const result = await appConfig.update((current) => ({
        ...current,
        lastUsedProfileName: name,
      }))
      if (result.type === 'Failure') deps.onError(result.error)
    } catch (err) {
      deps.onError(errorPayload(err, 'Save profile failed'))
    }
  }

  function close() {
    deps.onOpenChange(false)
  }

  async function submit(action: () => Promise<void>, fallbackMsg: string) {
    setSubmitting(true)
    try {
      await action()
      close()
    } catch (err) {
      deps.onError(errorPayload(err, fallbackMsg))
    } finally {
      setSubmitting(false)
    }
  }

  function resolve() {
    return submit(() => deps.onResolve(selectedProfile()), 'Failed to launch resolver')
  }

  function abort() {
    return submit(deps.onAbort, 'Failed to abort')
  }

  return {
    submitting,
    profiles,
    selectedProfile,
    setSelectedProfile,
    selectProfile,
    close,
    resolve,
    abort,
  }
}

export type ConflictDialogController = ReturnType<typeof createConflictDialogController>

export interface ConflictDialogControllerResult {
  submitting: SourceAccessor<boolean>
  profiles: SourceAccessor<
    (LauncherProfile & {
      scope: 'app' | 'project'
      order: number
    })[]
  >
  selectedProfile: SourceAccessor<string>
  setSelectedProfile: Setter<string>
  selectProfile: (name: string) => Promise<void>
  close: () => void
  resolve: () => Promise<void>
  abort: () => Promise<void>
}
