import type { SourceAccessor } from 'solid-js'
import { createSignal, createMemo, onSettled } from 'solid-js'
import { interpolatePrompt, type PromptVariables } from '~/core/launcher/prompt-interpolation.js'
import type { MergedLauncherConfig } from '~/core/launcher/launcher-config.js'
import type { TaskInfo } from '~/core/task/task-store.js'

const PERSIST_DEBOUNCE_MS = 400

export interface PromptPreviewDeps {
  selectedTemplate: () => string
  checkedSkills: () => Set<string>
  orderedSkills: () => {
    name: string
    text: string
  }[]
  config: () => MergedLauncherConfig | null
  /** Omitted for a project-level launch: task placeholders are then unavailable. */
  task?: () => TaskInfo
  projectPath: () => string
  worktreeDir: () => string
  projectSlug: string
  launchDir: () => string
  initialEditedPrompt: string | undefined
  onEditedPromptChange: (editedPrompt: string | undefined) => void
}

export function createPromptPreviewController(deps: PromptPreviewDeps): PromptPreviewControllerResult {
  const [editMode, setEditModeRaw] = createSignal(deps.initialEditedPrompt !== undefined)
  const [editedPrompt, setEditedPromptRaw] = createSignal(deps.initialEditedPrompt ?? '')
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  onSettled(() => () => clearTimeout(persistTimer))

  function persist(value: string | undefined) {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => deps.onEditedPromptChange(value), PERSIST_DEBOUNCE_MS)
  }

  const generatedPrompt = createMemo(() => {
    const cfg = deps.config()
    if (!cfg) return ''
    const templateName = deps.selectedTemplate()
    const templateText = cfg.templates.find((t) => t.name === templateName)?.text ?? ''
    const checked = deps.checkedSkills()
    const skillTexts = deps
      .orderedSkills()
      .filter((s) => checked.has(s.name))
      .map((s) => s.text)
    const variables: PromptVariables = {
      projectPath: deps.projectPath(),
      projectSlug: deps.projectSlug,
      skills: skillTexts.join('\n'),
      launchDir: deps.launchDir(),
    }
    const t = deps.task?.()
    if (t) {
      const taskDir = deps.worktreeDir().replace(/[\\/]$/, '') + '/' + t.folderName
      const taskVariables = {
        taskDir,
        taskSlug: t.folderName,
        taskTitle: t.title,
        taskNumber: t.number,
        taskStatus: t.status,
      } satisfies Pick<PromptVariables, 'taskDir' | 'taskSlug' | 'taskTitle' | 'taskNumber' | 'taskStatus'>
      return interpolatePrompt(templateText, {
        ...variables,
        ...taskVariables,
      })
    }
    return interpolatePrompt(templateText, {
      ...variables,
    })
  })
  const currentPrompt = createMemo(() => (editMode() ? editedPrompt() : generatedPrompt()))

  function setEditedPrompt(value: string) {
    setEditedPromptRaw(value)
    if (editMode()) persist(value)
  }

  function setEditMode(on: boolean) {
    if (on) {
      const generated = generatedPrompt()
      setEditedPromptRaw(generated)
      persist(generated)
    } else {
      setEditedPromptRaw('')
      persist(undefined)
    }
    setEditModeRaw(on)
  }

  function resetFromSaved(saved: string | undefined) {
    clearTimeout(persistTimer)
    setEditModeRaw(saved !== undefined)
    setEditedPromptRaw(saved ?? '')
  }

  return {
    editMode,
    setEditMode,
    editedPrompt,
    setEditedPrompt,
    currentPrompt,
    resetFromSaved,
  }
}

export interface PromptPreviewControllerResult {
  editMode: SourceAccessor<boolean>
  setEditMode: (on: boolean) => void
  editedPrompt: SourceAccessor<string>
  setEditedPrompt: (value: string) => void
  currentPrompt: SourceAccessor<string>
  resetFromSaved: (saved: string | undefined) => void
}
