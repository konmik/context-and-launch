import type { SourceAccessor } from 'solid-js'
import type { Setter } from 'solid-js'
import type { LauncherTemplate } from '../../core/launcher/launcher-config-data.js'
import type { LauncherSkill } from '../../core/launcher/launcher-config-data.js'
import type { LauncherProfile } from '../../core/launcher/launcher-config-data.js'
import type { LauncherShortcut } from '../../core/launcher/launcher-config-data.js'
import { createSignal, createEffect, createMemo, flush, onSettled, untrack, useContext } from 'solid-js'
import { LauncherConfigContext } from '../launcher/shared-launcher-config-storage.js'
import { mergeLauncherConfigs, type LauncherConfig } from '~/core/launcher/launcher-config-data.js'
import type { StoredSignal } from '~/util/stored-signal.js'
import { ProjectLauncherConfigContext } from '../launcher/project-launcher-config-storage.js'
import type { Accessor } from 'solid-js'
import { revalidate } from '@solidjs/router'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { LauncherColumnDefaults } from '~/core/launcher/launcher-config-data.js'
import {
  type ActiveFile,
  type FileView,
  activeFileLabel,
  isActiveFileMatch,
  buildContextOptions,
  buildFileEntryOptions,
  buildReferenceOptions,
  buildAllFileOptions,
  isReadOnly,
  checkReferenceStale,
  hasUnsavedEditorChanges,
  normalizeLineEndings,
  slugifyFileName,
  taskApiUrl,
  resolveFileViewMode,
  showSaveButton as showSaveButtonPure,
} from './task-detail-pure.js'
import { createFileUploadState } from './task-detail-upload.js'
import { TaskStatusContext } from './task-status-storage.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'
import { computeLaunchDir } from '../launcher/agent-launcher-pure.js'
import {
  getContext as getContextAction,
  saveContext as saveContextAction,
  deleteContext as deleteContextAction,
  deleteFile as deleteFileAction,
  uploadFile as uploadFileAction,
} from './task-api.js'
import { taskMutationRevalidateKeys } from '../shared/revalidate-keys.js'
import { createWorktreeRevision } from '../shared/worktree-revision.js'
import { getProjectLauncherMetadata } from '../launcher/launcher-api.js'
import { openNativeFileBrowser as openNativeFileBrowserServer } from '../shared/shared-api.js'

export type Tab = 'editor' | 'launcher'

async function readFileResponse(response: Response): Promise<string> {
  if (!response.ok) throw errorPayload(await response.json(), 'Load file failed')
  return normalizeLineEndings(await response.text())
}

export interface TaskDetailStateDeps {
  onError: (error: ErrorInfo) => void
  onClearError: () => void
  onBackgroundError: (error: ErrorInfo) => void
  sharedConfig?: StoredSignal<LauncherConfig>
  taskStatus?: StoredSignal<TaskInfo>
  worktreeRevision?: Accessor<number>
  getContext?: typeof getContextAction
  saveContext?: typeof saveContextAction
  deleteContext?: typeof deleteContextAction
  deleteFile?: typeof deleteFileAction
  uploadFile?: typeof uploadFileAction
  projectConfig?: StoredSignal<LauncherConfig>
  getProjectLauncherMetadata?: (projectSlug: string) => ReturnType<typeof getProjectLauncherMetadata>
  openNativeFileBrowser?: typeof openNativeFileBrowserServer
}

export function createTaskDetailState(
  props: {
    projectSlug: string
    onClose: () => void
  },
  deps: TaskDetailStateDeps,
): TaskDetailStateResult {
  const [activeFile, setActiveFile] = createSignal<ActiveFile>({
    type: 'context',
    name: 'description',
  })
  const [content, setContent] = createSignal('')
  const [savedContent, setSavedContent] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [confirmingClose, setConfirmingClose] = createSignal(false)
  const [pendingFile, setPendingFile] = createSignal<ActiveFile | null>(null)
  const [confirmingFileSwitch, setConfirmingFileSwitch] = createSignal(false)
  const [pendingTab, setPendingTab] = createSignal<Tab | null>(null)
  const [activeTab, setActiveTab] = createSignal<Tab>('editor')
  const [initialTabResolved, setInitialTabResolved] = createSignal(false)
  const sharedConfig = deps.sharedConfig ?? useContext(LauncherConfigContext)!
  const projectConfig = deps.projectConfig ?? useContext(ProjectLauncherConfigContext)!
  const metadata = createMemo(() => (deps.getProjectLauncherMetadata ?? getProjectLauncherMetadata)(props.projectSlug), {
    loadingValue: null,
  })
  const launcherConfig = createMemo(() => {
    const project = metadata()
    return (
      project && {
        ...project,
        ...mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()),
      }
    )
  })
  const [extraFiles, setExtraFiles] = createSignal<string[]>([])
  const [newFileDialogOpen, setNewFileDialogOpen] = createSignal(false)
  const [newFileName, setNewFileName] = createSignal('')
  const [confirmingDelete, setConfirmingDelete] = createSignal(false)
  const [dropdownOpen, setDropdownOpen] = createSignal(false)
  const [browsing, setBrowsing] = createSignal(false)
  const [fileView, setFileView] = createSignal<FileView>({
    kind: 'loading',
  })
  const taskStatus = deps.taskStatus ?? useContext(TaskStatusContext)!
  const task = taskStatus.get
  const folderName = () => task().folderName
  const useWorktree = () => task().useWorktree
  const [externallyChanged, setExternallyChanged] = createSignal(false)
  const [confirmingExternalChange, setConfirmingExternalChange] = createSignal(false)
  const worktreeRevision = deps.worktreeRevision ?? createWorktreeRevision(() => props.projectSlug)
  const [editedNumber, setEditedNumber] = createSignal(untrack(() => task().number))
  const [editedTitle, setEditedTitle] = createSignal(untrack(() => task().title))
  const hasUnsavedHeaderChanges = () => editedNumber().trim() !== task().number || editedTitle().trim() !== task().title

  async function saveTaskHeader() {
    const number = editedNumber().trim() || task().number
    const title = editedTitle().trim() || task().title
    setEditedNumber(number)
    setEditedTitle(title)
    if (number === task().number && title === task().title) return
    const result = await taskStatus.update((current) => ({
      ...current,
      number,
      title,
    }))
    if (result.type === 'Failure') deps.onError(result.error)
  }

  async function refreshTask() {
    await revalidate(['task-detail', ...taskMutationRevalidateKeys])
    const result = await taskStatus.refresh()
    if (result.type === 'Failure') deps.onError(result.error)
  }

  function taskUrl(suffix: string): string {
    return taskApiUrl(props.projectSlug, folderName(), suffix)
  }

  const launchDir = createMemo(() =>
    computeLaunchDir({
      useWorktree: useWorktree(),
      projectPath: launcherConfig()?.projectPath ?? '',
      worktreeRootPath: launcherConfig()?.worktreeRootPath ?? null,
      agentWorktreeDir: launcherConfig()?.agentWorktreeDir ?? '',
      folderName: folderName(),
      savedAgentWorktreeDir: task().agentWorktreeDir,
    }),
  )
  const upload = createFileUploadState({
    projectSlug: props.projectSlug,
    folderName,
    onError: deps.onError,
    onClearError: deps.onClearError,
    taskFileNames: () => task().fileNames,
    contextNames: () => task().contextNames,
    refreshFiles: refreshTask,
    requestFileSwitch,
    uploadFile: deps.uploadFile,
  })
  const contextOptions = (): ActiveFile[] =>
    buildContextOptions(['description', 'product-requirement-document'], task().contextNames, extraFiles())
  const fileEntryOptions = (): ActiveFile[] => buildFileEntryOptions(task().fileNames)
  const referenceOptions = (): ActiveFile[] => buildReferenceOptions(task().references)
  const allFileOptions = createMemo(() => buildAllFileOptions(contextOptions(), fileEntryOptions(), referenceOptions()))

  function isCurrentReadOnly(): boolean {
    return isReadOnly(activeFile())
  }

  function isReferenceStale(refPath: string): boolean {
    return checkReferenceStale(task().references, refPath)
  }

  const hasUnsavedFileChanges = () => hasUnsavedEditorChanges(activeTab(), fileView().kind, isCurrentReadOnly(), content(), savedContent())
  const hasAnyUnsavedChanges = () => hasUnsavedFileChanges() || hasUnsavedHeaderChanges()

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasAnyUnsavedChanges()) e.preventDefault()
  }

  onSettled(() => {
    const browserWindow = globalThis.window
    if (!browserWindow) return
    browserWindow.addEventListener('beforeunload', handleBeforeUnload)
    return () => browserWindow.removeEventListener('beforeunload', handleBeforeUnload)
  }) // Only the newest load may touch the view state: a slow response for a file
  // the user has already navigated away from must not clobber the current view
  // or content.
  let loadSeq = 0

  async function loadContextContent(
    af: ActiveFile & {
      type: 'context'
    },
    background = false,
  ): Promise<void> {
    const seq = ++loadSeq
    if (!background)
      setFileView({
        kind: 'loading',
      })
    try {
      const data = await (deps.getContext ?? getContextAction)(props.projectSlug, folderName(), af.name)
      if (seq !== loadSeq) return
      const normalized = data ? normalizeLineEndings(data.content) : ''
      setContent(normalized)
      setSavedContent(normalized)
    } catch (e) {
      if (seq !== loadSeq) return
      setContent('')
      setSavedContent('')
      deps.onError(errorPayload(e, 'Load failed'))
    } finally {
      if (seq === loadSeq)
        setFileView({
          kind: 'editor',
        })
    }
  }

  function loadFileByName(fileName: string, url: string, background = false): void {
    const seq = ++loadSeq
    const mode = resolveFileViewMode(fileName)
    if (!background) {
      setContent('')
      setSavedContent('')
    }
    if (mode === 'image') {
      setFileView({
        kind: 'image',
        url,
      })
    } else if (mode === 'editor') {
      if (!background)
        setFileView({
          kind: 'loading',
        })
      fetch(url)
        .then(async (res) => {
          const text = await readFileResponse(res)
          if (seq !== loadSeq) return
          setContent(text)
          setSavedContent(text)
        })
        .catch((e) => {
          if (seq !== loadSeq) return
          deps.onError(errorPayload(e, 'Load failed'))
        })
        .finally(() => {
          if (seq === loadSeq)
            setFileView({
              kind: 'editor',
            })
        })
    } else {
      setFileView({
        kind: 'unsupported',
      })
    }
  }

  createEffect(
    () => [projectConfig.get(), task().status, initialTabResolved()] as const,
    ([data, status, resolved]) => {
      if (!data || resolved) return
      if (data.columnDefaults?.[status]?.lastLayer === 'launcher') setActiveTab('launcher')
      setInitialTabResolved(true)
    },
  )

  function patchColumnDefaults(patch: Partial<LauncherColumnDefaults>) {
    const column = task().status
    projectConfig
      .update((current) => ({
        ...current,
        columnDefaults: {
          ...current.columnDefaults,
          [column]: {
            templateName: null,
            checkedSkills: [],
            profileName: null,
            ...(current.columnDefaults && Object.hasOwn(current.columnDefaults, column) && current.columnDefaults[column]),
            ...patch,
          },
        },
      }))
      .then((result) => {
        if (result.type === 'Failure') {
          deps.onBackgroundError(result.error)
          return
        }
      })
      .catch((e) => {
        deps.onBackgroundError(errorPayload(e, 'Save failed'))
      })
  }

  onSettled(() => {
    void loadContextContent({
      type: 'context',
      name: 'description',
    })
  })

  function fileContentUrl(
    af: ActiveFile & {
      type: 'file' | 'reference'
    },
  ): string {
    return af.type === 'file'
      ? taskUrl(`files/${encodeURIComponent(af.name)}`)
      : taskUrl(`references/content?path=${encodeURIComponent(af.path)}`)
  }

  async function readFileText(af: ActiveFile): Promise<string> {
    if (af.type === 'context') {
      const data = await (deps.getContext ?? getContextAction)(props.projectSlug, folderName(), af.name)
      return data ? normalizeLineEndings(data.content) : ''
    }
    const response = await fetch(fileContentUrl(af))
    return readFileResponse(response)
  }

  async function loadActiveFile(af: ActiveFile, background = false): Promise<void> {
    setExternallyChanged(false)
    if (af.type === 'context') {
      await loadContextContent(af, background)
    } else {
      loadFileByName(activeFileLabel(af), fileContentUrl(af), background)
    }
  }

  /**
   * The worktree revision covers every Task in the Project, so it answers
   * "something was written" and never "this file was written". Only the file
   * being edited decides a conflict, and only by its content: a revision bump
   * whose disk content still matches what the editor loaded is not one.
   */
  async function detectExternalChange(af: ActiveFile): Promise<void> {
    try {
      const text = await readFileText(af)
      if (!isActiveFileMatch(af, activeFile()) || !hasUnsavedFileChanges()) return
      if (text === savedContent()) return
      setExternallyChanged(true)
    } catch (e) {
      deps.onError(errorPayload(e, 'Load failed'))
    }
  }

  createEffect(
    () => {
      const af = activeFile()
      return [af, untrack(activeTab)] as const
    },
    ([af, tab]) => {
      void (async () => {
        if (tab !== 'editor') return
        deps.onClearError()
        await untrack(() => loadActiveFile(af))
      })()
    },
    {
      defer: true,
    },
  )
  createEffect(
    () => {
      const revision = worktreeRevision()
      return untrack(() => [revision, activeTab(), hasUnsavedFileChanges(), activeFile()] as const)
    },
    ([, tab, hasUnsavedChanges, af]) => {
      void refreshTask()
      if (tab !== 'editor') return
      if (hasUnsavedChanges) {
        void untrack(() => detectExternalChange(af))
        return
      }
      void untrack(() => loadActiveFile(af, true))
    },
    {
      defer: true,
    },
  )

  async function saveFileContent() {
    const af = activeFile()
    if (af.type !== 'context') return
    setSaving(true)
    try {
      const result = await (deps.saveContext ?? saveContextAction)(props.projectSlug, folderName(), af.name, content())
      if (result.type === 'Success') setSavedContent(content())
      else deps.onError(result.error)
    } catch (e) {
      deps.onError(errorPayload(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  function requestFileSwitch(file: ActiveFile) {
    if (isActiveFileMatch(file, activeFile()) && activeTab() === 'editor') return
    if (hasUnsavedFileChanges()) {
      setPendingFile(file)
      setConfirmingFileSwitch(true)
      return
    }
    setActiveTab('editor')
    if (!isActiveFileMatch(file, activeFile())) setActiveFile(file)
  }

  function switchTab(tab: Tab) {
    if (tab === activeTab()) return
    if (tab !== 'editor') {
      if (hasUnsavedFileChanges()) {
        setPendingFile(null)
        setPendingTab(tab)
        setConfirmingFileSwitch(true)
        return
      }
      setActiveTab(tab)
      patchColumnDefaults({
        lastLayer: tab,
      })
    } else {
      setActiveTab('editor')
      patchColumnDefaults({
        lastLayer: 'editor',
      })
    }
  }

  function proceedFileSwitch() {
    const file = pendingFile()
    const toTab = pendingTab()
    setConfirmingFileSwitch(false)
    setPendingFile(null)
    setPendingTab(null)
    if (toTab) {
      setActiveTab(toTab)
      patchColumnDefaults({
        lastLayer: toTab,
      })
    } else if (file) {
      setActiveTab('editor')
      setActiveFile(file)
    }
  }

  function selectFile(af: ActiveFile) {
    setDropdownOpen(false)
    requestFileSwitch(af)
  }

  function openNewFileDialog() {
    setDropdownOpen(false)
    setNewFileName('')
    setNewFileDialogOpen(true)
  }

  function submitNewFile() {
    const raw = newFileName()
    const contextFileName = slugifyFileName(raw)
    if (!contextFileName) return
    setNewFileDialogOpen(false)
    if (!contextOptions().some((o) => o.type === 'context' && o.name === contextFileName))
      setExtraFiles((prev) => [...prev, contextFileName])
    requestFileSwitch({
      type: 'context',
      name: contextFileName,
    })
  }

  async function deleteOrRemoveFile() {
    const af = activeFile()
    setConfirmingDelete(false)
    try {
      if (af.type === 'reference') {
        const result = await taskStatus.update((current) => ({
          ...current,
          references: current.references.filter((reference) => reference.path !== af.path),
        }))
        if (result.type === 'Failure') {
          deps.onError(result.error)
          return
        }
      } else if (af.type === 'file') {
        const result = await (deps.deleteFile ?? deleteFileAction)(props.projectSlug, folderName(), af.name)
        if (result.type === 'Failure') {
          deps.onError(result.error)
          return
        }
      } else {
        const result = await (deps.deleteContext ?? deleteContextAction)(props.projectSlug, folderName(), af.name)
        if (result.type === 'Failure') {
          deps.onError(result.error)
          return
        }
        setExtraFiles((prev) => prev.filter((n) => n !== af.name))
      }
      const remaining = allFileOptions().filter((f) => !isActiveFileMatch(f, af))
      setActiveFile(
        remaining[0] ?? {
          type: 'context',
          name: 'description',
        },
      )
      await refreshTask()
    } catch (e) {
      deps.onError(errorPayload(e, 'Delete failed'))
    }
  }

  function handleTrashClick() {
    if (activeFile().type === 'reference') deleteOrRemoveFile()
    else setConfirmingDelete(true)
  }

  function close() {
    if (hasAnyUnsavedChanges()) {
      setConfirmingClose(true)
      return
    }
    props.onClose()
  }

  function forceClose() {
    setConfirmingClose(false)
    props.onClose()
  }

  async function openNativeFileBrowser() {
    setBrowsing(true)
    deps.onClearError()
    try {
      const remembered = localStorage.getItem('picker:references:lastDir') ?? ''
      const refs = task().references
      const lastRef = refs[refs.length - 1]?.path
      const fallback = lastRef ? lastRef.replace(/\/[^/]*$/, '') : ''
      const startDir = remembered || fallback
      const paths = await (deps.openNativeFileBrowser ?? openNativeFileBrowserServer)(startDir || null)
      if (paths.length === 0) return
      const lastPicked = paths[paths.length - 1]
      const pickedDir = lastPicked.replace(/\/[^/]*$/, '')
      if (pickedDir) localStorage.setItem('picker:references:lastDir', pickedDir)
      await handleReferencesSelected(paths)
    } catch (e) {
      deps.onError(errorPayload(e, 'Browse failed'))
    } finally {
      setBrowsing(false)
    }
  }

  async function handleReferencesSelected(paths: string[]) {
    deps.onClearError()
    try {
      const result = await taskStatus.update((current) => ({
        ...current,
        references: [...new Set([...current.references.map((reference) => reference.path), ...paths])].map((path) => ({
          path,
          exists: true,
        })),
      }))
      if (result.type === 'Failure') {
        deps.onError(result.error)
        return
      } // Show the reference the user just picked before reloading the file list:
      // the switch is what they asked for, and it must not wait on a refresh.
      if (paths.length > 0)
        requestFileSwitch({
          type: 'reference',
          path: paths[0],
        })
      await refreshTask()
    } catch (e) {
      deps.onError(errorPayload(e, 'Add reference failed'))
    }
  }

  async function saveAll() {
    if (externallyChanged() && hasUnsavedFileChanges()) {
      setConfirmingExternalChange(true)
      return
    }
    if (hasUnsavedHeaderChanges()) await saveTaskHeader()
    if (hasUnsavedFileChanges()) await saveFileContent()
    await refreshTask()
  }

  async function overwriteExternalChange() {
    setConfirmingExternalChange(false)
    setExternallyChanged(false) // saveAll must observe the user's explicit overwrite choice in this event turn.
    flush()
    await saveAll()
  }

  function discardExternalChange() {
    setConfirmingExternalChange(false)
    void loadActiveFile(activeFile())
  }

  const showSaveButton = () => showSaveButtonPure(activeTab(), activeFile().type)
  return {
    activeFile,
    content,
    setContent,
    saving,
    confirmingClose,
    setConfirmingClose,
    confirmingFileSwitch,
    activeTab,
    initialTabResolved,
    launcherConfig,
    editedNumber,
    setEditedNumber,
    editedTitle,
    setEditedTitle,
    hasUnsavedHeaderChanges,
    hasAnyUnsavedChanges,
    saveAll,
    newFileDialogOpen,
    setNewFileDialogOpen,
    newFileName,
    setNewFileName,
    confirmingDelete,
    setConfirmingDelete,
    dropdownOpen,
    setDropdownOpen,
    browsing,
    fileView,
    uploading: upload.uploading,
    dragging: upload.dragging,
    confirmOverwrite: upload.confirmOverwrite,
    confirmSize: upload.confirmSize,
    launchDir,
    allFileOptions,
    isReferenceStale,
    hasUnsavedFileChanges,
    isCurrentReadOnly,
    showSaveButton,
    externallyChanged,
    confirmingExternalChange,
    overwriteExternalChange,
    discardExternalChange,
    switchTab,
    selectFile,
    openNewFileDialog,
    submitNewFile,
    deleteOrRemoveFile,
    handleTrashClick,
    close,
    forceClose,
    proceedFileSwitch,
    cancelFileSwitch: () => {
      setConfirmingFileSwitch(false)
      setPendingFile(null)
      setPendingTab(null)
    },
    handleDragOver: upload.handleDragOver,
    handleDragLeave: upload.handleDragLeave,
    handleDrop: upload.handleDrop,
    handleFileInputChange: upload.handleFileInputChange,
    confirmSizeAndUpload: upload.confirmSizeAndUpload,
    confirmOverwriteAndUpload: upload.confirmOverwriteAndUpload,
    openNativeFileBrowser,
    cancelSizeConfirm: upload.cancelSizeConfirm,
    cancelOverwriteConfirm: upload.cancelOverwriteConfirm,
    patchColumnDefaults,
  }
}

export type TaskDetailState = ReturnType<typeof createTaskDetailState>

export interface TaskDetailStateResult {
  activeFile: SourceAccessor<ActiveFile>
  content: SourceAccessor<string>
  setContent: Setter<string>
  saving: SourceAccessor<boolean>
  confirmingClose: SourceAccessor<boolean>
  setConfirmingClose: Setter<boolean>
  confirmingFileSwitch: SourceAccessor<boolean>
  activeTab: SourceAccessor<Tab>
  initialTabResolved: SourceAccessor<boolean>
  launcherConfig: SourceAccessor<{
    templates: (LauncherTemplate & {
      scope: 'app' | 'project'
      order: number
    })[]
    skills: (LauncherSkill & {
      scope: 'app' | 'project'
      order: number
    })[]
    profiles: (LauncherProfile & {
      scope: 'app' | 'project'
      order: number
    })[]
    shortcuts: (LauncherShortcut & {
      scope: 'app' | 'project'
      order: number
    })[]
    columnDefaults: Record<string, LauncherColumnDefaults>
    worktreeRootPath: string | null
    branchPrefix?: string
    conflictResolutionPrompt: string
    projectPath: string
    tasksBranch?: string
    worktreeDir: string
    agentWorktreeDir: string
  } | null>
  editedNumber: SourceAccessor<string>
  setEditedNumber: Setter<string>
  editedTitle: SourceAccessor<string>
  setEditedTitle: Setter<string>
  hasUnsavedHeaderChanges: () => boolean
  hasAnyUnsavedChanges: () => boolean
  saveAll: () => Promise<void>
  newFileDialogOpen: SourceAccessor<boolean>
  setNewFileDialogOpen: Setter<boolean>
  newFileName: SourceAccessor<string>
  setNewFileName: Setter<string>
  confirmingDelete: SourceAccessor<boolean>
  setConfirmingDelete: Setter<boolean>
  dropdownOpen: SourceAccessor<boolean>
  setDropdownOpen: Setter<boolean>
  browsing: SourceAccessor<boolean>
  fileView: SourceAccessor<FileView>
  uploading: SourceAccessor<boolean>
  dragging: SourceAccessor<boolean>
  confirmOverwrite: SourceAccessor<{
    fileName: string
    file: File
  } | null>
  confirmSize: SourceAccessor<{
    fileName: string
    file: File
    size: number
  } | null>
  launchDir: SourceAccessor<string>
  allFileOptions: SourceAccessor<ActiveFile[]>
  isReferenceStale: (refPath: string) => boolean
  hasUnsavedFileChanges: () => boolean
  isCurrentReadOnly: () => boolean
  showSaveButton: () => boolean
  externallyChanged: SourceAccessor<boolean>
  confirmingExternalChange: SourceAccessor<boolean>
  overwriteExternalChange: () => Promise<void>
  discardExternalChange: () => void
  switchTab: (tab: Tab) => void
  selectFile: (af: ActiveFile) => void
  openNewFileDialog: () => void
  submitNewFile: () => void
  deleteOrRemoveFile: () => Promise<void>
  handleTrashClick: () => void
  close: () => void
  forceClose: () => void
  proceedFileSwitch: () => void
  cancelFileSwitch: () => void
  handleDragOver: (e: DragEvent) => void
  handleDragLeave: (e: DragEvent) => void
  handleDrop: (e: DragEvent) => Promise<void>
  handleFileInputChange: (e: Event) => Promise<void>
  confirmSizeAndUpload: () => void
  confirmOverwriteAndUpload: () => void
  openNativeFileBrowser: () => Promise<void>
  cancelSizeConfirm: () => void
  cancelOverwriteConfirm: () => void
  patchColumnDefaults: (patch: Partial<LauncherColumnDefaults>) => void
}
