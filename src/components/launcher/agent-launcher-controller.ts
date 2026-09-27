import type { SourceAccessor } from 'solid-js'
import type { LauncherSkill } from '../../core/launcher/launcher-config-data.js'
import type { Setter } from 'solid-js'
import type { ListReorder } from '../board/list-reorder.js'
import { createSignal, createEffect, createMemo } from 'solid-js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import type { MergedLauncherConfig, LauncherColumnDefaults } from '~/core/launcher/launcher-config.js'
import { errorPayload, type ErrorInfo, type ActionError } from '~/core/shared/errors.js'
import type { LaunchAgentActionResult } from './launcher-api.js'
import type { Result } from '~/util/result.js'
import { PROJECT_LAUNCH_KEY } from '~/core/launcher/launch-keys.js'
import { createListReorder, orderByNameList } from '../board/list-reorder.js'
import { resolveDefaults } from './agent-launcher-pure.js'
import { createPromptPreviewController } from './prompt-preview-controller.js'

type MergedSkill = MergedLauncherConfig['skills'][number]

export interface LaunchArgs {
  initialPrompt: string
  profileName: string
  useWorktree: boolean
  force: boolean
  skipBehindRemote: boolean
  launchDir: string
}

export type LaunchFailure = ActionError | LaunchAgentActionResult

export type LaunchInvoker = (args: LaunchArgs) => Promise<Result<undefined, LaunchFailure>>

export interface AgentLauncherDeps {
  projectSlug: string
  /** Omitted for a project-level launch that runs without a ticket. */
  ticket?: () => TicketInfo
  config: MergedLauncherConfig | null
  onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void
  useWorktree: boolean
  projectPath: string
  worktreeDir: string
  launchDir: () => string
  launch: LaunchInvoker
  onError?: (error: ErrorInfo) => void
}

export function createAgentLauncherController(props: AgentLauncherDeps): AgentLauncherControllerResult {
  const defaultsKey = () => (props.ticket ? props.ticket().status : PROJECT_LAUNCH_KEY)
  const resetKey = () => (props.ticket ? props.ticket().folderName : PROJECT_LAUNCH_KEY)
  const initial = resolveDefaults(props.config, defaultsKey())
  const [selectedTemplate, setSelectedTemplate] = createSignal(initial.templateName)
  const [selectedProfile, setSelectedProfile] = createSignal(initial.profileName)
  const [checkedSkills, setCheckedSkills] = createSignal<Set<string>>(new Set(initial.checkedSkills))
  const [skillOrder, setSkillOrder] = createSignal<string[]>(initial.skillOrder)
  const [launching, setLaunching] = createSignal(false)
  const [errorInfo, storeErrorInfo] = createSignal<ErrorInfo | null>(null)
  function setErrorInfo(error: ErrorInfo | null) {
    storeErrorInfo(error)
    if (error) props.onError?.(error)
  }
  const [behindRemoteMsg, setBehindRemoteMsg] = createSignal('')
  const [dirtyWorktreeMsg, setDirtyWorktreeMsg] = createSignal('')
  const orderedSkills = createMemo(() => orderByNameList(props.config?.skills ?? [], skillOrder()))
  const preview = createPromptPreviewController({
    selectedTemplate,
    checkedSkills,
    orderedSkills,
    config: () => props.config,
    ticket: props.ticket,
    projectPath: () => props.projectPath,
    worktreeDir: () => props.worktreeDir,
    projectSlug: props.projectSlug,
    launchDir: props.launchDir,
    initialEditedPrompt: initial.editedPrompt,
    onEditedPromptChange: (editedPrompt) =>
      props.onDefaultsChange({
        editedPrompt,
      }),
  })
  const initialConfig = props.config
  const initialResetKey = resetKey()
  createEffect(
    () => ({
      config: props.config,
      key: resetKey(),
      defaultsKey: defaultsKey(),
      selectedTemplate: selectedTemplate(),
      selectedProfile: selectedProfile(),
    }),
    (current, previous) => {
      const { config: cfg, key, defaultsKey: currentDefaultsKey } = current
      const defaults = resolveDefaults(cfg, currentDefaultsKey)
      const configFirstArrived = !(previous ? previous.config : initialConfig) && cfg
      const ticketChanged = key !== (previous?.key ?? initialResetKey)
      if (configFirstArrived || ticketChanged) {
        setSelectedTemplate(defaults.templateName)
        setSelectedProfile(defaults.profileName)
        setCheckedSkills(new Set(defaults.checkedSkills))
        setSkillOrder(defaults.skillOrder)
        preview.resetFromSaved(defaults.editedPrompt)
        return
      }
      if (cfg && !cfg.templates.some((item) => item.name === current.selectedTemplate)) {
        setSelectedTemplate(defaults.templateName)
      }
      if (cfg && !cfg.profiles.some((item) => item.name === current.selectedProfile)) {
        setSelectedProfile(defaults.profileName)
      }
    },
  )

  function toggleSkill(name: string) {
    const next = new Set(checkedSkills())
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setCheckedSkills(next)
    props.onDefaultsChange({
      checkedSkills: [...next],
    })
  }

  const skillReorder = createListReorder<MergedSkill>({
    items: orderedSkills,
    idOf: (s) => s.name,
    onReorder: (orderedNames) => {
      setSkillOrder(orderedNames)
      props.onDefaultsChange({
        skillOrder: orderedNames,
      })
    },
  })

  async function launchAgent(extra?: Partial<Pick<LaunchArgs, 'force' | 'skipBehindRemote'>>) {
    setLaunching(true)
    setErrorInfo(null)
    setBehindRemoteMsg('')
    setDirtyWorktreeMsg('')
    try {
      const result = await props.launch({
        initialPrompt: preview.currentPrompt(),
        useWorktree: props.useWorktree,
        profileName: selectedProfile(),
        force: extra?.force === true,
        skipBehindRemote: extra?.skipBehindRemote === true,
        launchDir: props.launchDir(),
      })
      if (result.type === 'Success') return
      switch (result.error.type) {
        case 'behindRemote':
          setBehindRemoteMsg(result.error.message)
          break
        case 'dirtyWorktree':
          setDirtyWorktreeMsg(result.error.message)
          break
        default:
          setErrorInfo(result.error)
          break
      }
    } catch (e: unknown) {
      setErrorInfo(errorPayload(e, 'Launch failed'))
    } finally {
      setLaunching(false)
    }
  }

  return {
    selectedTemplate,
    selectedProfile,
    checkedSkills,
    orderedSkills,
    launching,
    errorInfo,
    behindRemoteMsg,
    dirtyWorktreeMsg,
    setSelectedTemplate,
    setSelectedProfile,
    setBehindRemoteMsg,
    setDirtyWorktreeMsg,
    toggleSkill,
    skillReorder,
    launchAgent,
    preview,
    launchDir: props.launchDir,
  }
}

export type AgentLauncherController = ReturnType<typeof createAgentLauncherController>

export interface AgentLauncherControllerResult {
  selectedTemplate: SourceAccessor<string>
  selectedProfile: SourceAccessor<string>
  checkedSkills: SourceAccessor<Set<string>>
  orderedSkills: SourceAccessor<
    (LauncherSkill & {
      scope: 'app' | 'project'
      order: number
    })[]
  >
  launching: SourceAccessor<boolean>
  errorInfo: SourceAccessor<ErrorInfo | null>
  behindRemoteMsg: SourceAccessor<string>
  dirtyWorktreeMsg: SourceAccessor<string>
  setSelectedTemplate: Setter<string>
  setSelectedProfile: Setter<string>
  setBehindRemoteMsg: Setter<string>
  setDirtyWorktreeMsg: Setter<string>
  toggleSkill: (name: string) => void
  skillReorder: ListReorder<
    LauncherSkill & {
      scope: 'app' | 'project'
      order: number
    }
  >
  launchAgent: (extra?: Partial<Pick<LaunchArgs, 'force' | 'skipBehindRemote'>>) => Promise<void>
  preview: {
    editMode: SourceAccessor<boolean>
    setEditMode: (on: boolean) => void
    editedPrompt: SourceAccessor<string>
    setEditedPrompt: (value: string) => void
    currentPrompt: SourceAccessor<string>
    resetFromSaved: (saved: string | undefined) => void
  }
  launchDir: () => string
}
