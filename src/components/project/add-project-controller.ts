import type { SourceAccessor } from 'solid-js'
import type { Setter } from 'solid-js'
import { createSignal, createEffect } from 'solid-js'
import { previewProjectPath } from './project-api.js'
import { pickDirectory } from '../shared/directory-picker.js'
import type { Result } from '~/util/result.js'
import type { ActionError } from '~/core/shared/errors.js'
import type { AddProjectResult } from './project-api.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { createErrorState } from '~/util/error-state.js'

export type AddProjectAction = (
  pathValue: string,
  branch: string,
  mainBranch: string,
  boardId: string,
  name: string,
) => Promise<Result<AddProjectResult, ActionError>>

export interface AddProjectControllerDeps {
  action: AddProjectAction
  onSuccess?: (projectSlug: string) => void
  onError?: (error: UserFacingError) => void
  onClearError?: () => void
}

export function createAddProjectController(deps: AddProjectControllerDeps): AddProjectControllerResult {
  const [nameValue, setNameValue] = createSignal('')
  const [pathValue, setPathValue] = createSignal('')
  const [branchValue, setBranchValue] = createSignal('tickets')
  const [mainBranchValue, setMainBranchValue] = createSignal('')
  const [mainBranchTouched, setMainBranchTouched] = createSignal(false)
  const [boardId, setBoardId] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const { error: localError, setError: setLocalError } = createErrorState(deps.onError)
  const [debouncedPath, setDebouncedPath] = createSignal('')
  createEffect(
    () => pathValue().trim(),
    (p) => {
      const handle = setTimeout(() => setDebouncedPath(p), 300)
      return () => clearTimeout(handle)
    },
  )
  createEffect(debouncedPath, (p) => {
    if (!p) {
      setMainBranchValue('')
      return
    }
    let cancelled = false
    previewProjectPath(p)
      .then((res) => {
        if (cancelled) return
        if (res.type === 'Failure') {
          setLocalError(res.error)
          return
        }
        deps.onClearError?.()
        if (!mainBranchTouched()) setMainBranchValue(res.value.mainBranch)
      })
      .catch((err) => {
        if (!cancelled) setLocalError(errorPayload(err, 'Preview project failed'))
      })
    return () => {
      cancelled = true
    }
  })

  async function handleBrowsePath() {
    try {
      const result = await pickDirectory(pathValue().trim())
      if (result.type === 'Failure') setLocalError(result.error)
      else if (result.value !== undefined) setPathValue(result.value)
    } catch (err) {
      setLocalError(errorPayload(err, 'Browse failed'))
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting()) return
    const trimmed = pathValue().trim()
    if (!trimmed) return
    const branch = branchValue().trim() || 'tickets'
    setSubmitting(true)
    deps.onClearError?.()
    setLocalError()
    try {
      const result = await deps.action(trimmed, branch, mainBranchValue().trim(), boardId(), nameValue().trim())
      if (result.type === 'Failure') setLocalError(result.error)
      else deps.onSuccess?.(result.value.projectSlug)
    } catch (err) {
      setLocalError(errorPayload(err, 'Add project failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    nameValue,
    pathValue,
    branchValue,
    mainBranchValue,
    boardId,
    submitting,
    localError,
    setLocalError,
    setNameValue,
    setPathValue,
    setBranchValue,
    setMainBranchValue: (v: string) => {
      setMainBranchTouched(true)
      setMainBranchValue(v)
    },
    setBoardId,
    handleBrowsePath,
    handleSubmit,
  }
}

export type AddProjectController = ReturnType<typeof createAddProjectController>

export interface AddProjectControllerResult {
  nameValue: SourceAccessor<string>
  pathValue: SourceAccessor<string>
  branchValue: SourceAccessor<string>
  mainBranchValue: SourceAccessor<string>
  boardId: SourceAccessor<string>
  submitting: SourceAccessor<boolean>
  localError: SourceAccessor<UserFacingError | undefined>
  setLocalError: (error?: UserFacingError) => void
  setNameValue: Setter<string>
  setPathValue: Setter<string>
  setBranchValue: Setter<string>
  setMainBranchValue: (v: string) => void
  setBoardId: Setter<string>
  handleBrowsePath: () => Promise<void>
  handleSubmit: (e: SubmitEvent) => Promise<void>
}
