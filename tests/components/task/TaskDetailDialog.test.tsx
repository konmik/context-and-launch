import type { RenderResult } from '../../test-render.js'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderWithErrors, screen, cleanup, fireEvent, waitFor } from '../../test-render.js'
import { createRouter, memoryHistory } from '@solidjs/router'
import type { JSX } from '@solidjs/web'
import { createSignal, createRoot, createMemo } from 'solid-js'
import TaskDetailDialog from '../../../src/components/task/TaskDetailDialog.js'
import { createTaskDetailState, type TaskDetailStateDeps } from '../../../src/components/task/task-detail-state.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { createStoredSignal } from '~/util/stored-signal.js'
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js'
import { success } from '~/util/result.js'

const mockGetContext = vi.fn().mockResolvedValue({
  content: '',
})

const mockUpdateTask = vi.fn()

const mockDeleteContext = vi.fn().mockResolvedValue(success(undefined))

const mockUploadFile = vi.fn().mockResolvedValue(
  success({
    results: [],
  }),
)

const emptyTaskFiles = {
  contextNames: [],
  fileNames: [],
  references: [],
}

const mockGetTaskFiles = vi.fn().mockResolvedValue(emptyTaskFiles)

const [worktreeRevision, setWorktreeRevision] = createSignal(0)

const mockGetMergedLauncherConfig = vi.fn().mockResolvedValue({
  projectConfig: {
    templates: [],
    skills: [],
  },
  templates: [],
  skills: [],
  profiles: [],
  shortcuts: [],
  columnDefaults: {},
  worktreeRootPath: null,
  conflictResolutionPrompt: '',
  projectBoardId: null,
  projectName: '',
  projectPath: '',
  worktreeDir: '',
  agentWorktreeDir: '',
})

function makeTask(folder: string, number: string, title: string): TaskInfo {
  return {
    number,
    title,
    status: 'todo',
    folderName: folder,
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
  }
}

const emptyConfig = {
  templates: [],
  skills: [],
  profiles: [],
  columnDefaults: {},
}

function stateDependencies(task: TaskInfo): TaskDetailStateDeps {
  const initial = createMemo(async () => (await mockGetMergedLauncherConfig()).projectConfig)
  let saved = task
  const taskStatus = createStoredSignal(
    () => saved,
    async (transform) => {
      saved = transform(saved)
      mockUpdateTask(saved)
      return {
        type: 'Success',
        value: saved,
      }
    },
  )
  return {
    taskStatus: {
      ...taskStatus,
      refresh: async () => {
        const files = await mockGetTaskFiles('test-project', saved.folderName)
        return taskStatus.update((current) => ({
          ...current,
          ...files,
        }))
      },
    },
    onError: vi.fn(),
    onClearError: vi.fn(),
    onBackgroundError: vi.fn(),
    sharedConfig: createStoredSignal(
      () => emptyConfig,
      async (transform) => ({
        type: 'Success',
        value: transform(emptyConfig),
      }),
    ),
    worktreeRevision,
    getContext: mockGetContext,
    saveContext: async () => success(undefined),
    deleteContext: mockDeleteContext,
    deleteFile: async () => success(undefined),
    uploadFile: mockUploadFile,
    getProjectLauncherMetadata: mockGetMergedLauncherConfig,
    projectConfig: createStoredSignal(initial, async (transform) => ({
      type: 'Success',
      value: transform(initial()),
    })),
    openNativeFileBrowser: async () => [],
  }
}

function render(view: () => JSX.Element): RenderResult {
  const Router = createRouter({
    routes: [],
    history: memoryHistory(),
  })
  return renderWithErrors(() => <Router>{view}</Router>)
}

function renderTask(task: TaskInfo): RenderResult {
  const stateDeps = stateDependencies(task)
  return render(() => <TaskDetailDialog onClose={() => {}} projectSlug="test-project" task={task} stateDeps={stateDeps} />)
}

async function expectEditorText(text: string) {
  await waitFor(() => expect(document.querySelector('.cm-content')?.textContent).toBe(text))
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

describe('TaskDetailDialog content loading', () => {
  it('preserves an unsaved title when the board refreshes the same task', async () => {
    const initial = makeTask('t-1-alpha', 'T-1', 'Alpha')
    const [task, setTask] = createSignal(initial)
    const stateDeps = stateDependencies(initial)
    render(() => <TaskDetailDialog onClose={() => {}} projectSlug="test-project" task={task()} stateDeps={stateDeps} />)
    const title = await screen.findByTestId('task-detail-title-input')
    fireEvent.input(title, {
      target: {
        value: 'Unsaved title',
      },
    })
    setTask({
      ...initial,
    })
    await flush()
    expect(screen.getByTestId('task-detail-title-input')).toMatchObject({
      value: 'Unsaved title',
    })
  })
  afterEach(() => {
    cleanup()
    mockGetContext.mockResolvedValue({
      content: '',
    })
  })
  it('loads and displays context content for a task', async () => {
    mockGetContext.mockResolvedValue({
      content: 'Hello World',
    })
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    await expectEditorText('Hello World')
  })
  it('a slow context load does not clobber a newer image selection', async () => {
    let resolveContext!: (value: { content: string }) => void
    mockGetContext.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveContext = resolve
        }),
    )
    const task = {
      ...makeTask('t-1-alpha', 'T-1', 'Alpha'),
      fileNames: ['shot.png'],
    }
    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTaskDetailState(
        {
          projectSlug: 'test-project',
          onClose: () => {},
        },
        stateDependencies(task),
      ),
      dispose: disposeRoot,
    }))
    try {
      expect(state.fileView().kind).toBe('loading')
      state.selectFile({
        type: 'file',
        name: 'shot.png',
      })
      await flush()
      expect(state.fileView().kind).toBe('image')
      resolveContext({
        content: 'description text',
      })
      await flush()
      expect(state.fileView().kind).toBe('image')
      expect(state.content()).toBe('')
    } finally {
      dispose()
    }
  })
})
describe('TaskDetailDialog external worktree changes', () => {
  afterEach(() => {
    cleanup()
    setWorktreeRevision(0)
    mockGetContext.mockResolvedValue({
      content: '',
    })
  })

  async function changeWorktree() {
    setWorktreeRevision((revision) => revision + 1)
    await flush()
    await flush()
  }

  it('reloads the open markdown file when the worktree changes underneath it', async () => {
    mockGetContext.mockResolvedValue({
      content: 'written by me',
    })
    renderTask(makeTask('t-1-alpha', 'T-1', 'Alpha'))
    await flush()
    await flush()
    await expectEditorText('written by me')
    mockGetContext.mockResolvedValue({
      content: 'written by the agent',
    })
    await changeWorktree()
    await expectEditorText('written by the agent')
  })
  it('keeps unsaved edits and refuses to save over an external change', async () => {
    mockGetContext.mockResolvedValue({
      content: 'original',
    })
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTaskDetailState(
        {
          projectSlug: 'test-project',
          onClose: () => {},
        },
        stateDependencies(task),
      ),
      dispose: disposeRoot,
    }))
    try {
      await flush()
      state.setContent('my unsaved edit')
      mockGetContext.mockResolvedValue({
        content: 'written by the agent',
      })
      await changeWorktree()
      expect(state.content()).toBe('my unsaved edit')
      expect(state.externallyChanged()).toBe(true)
      await state.saveAll()
      expect(state.confirmingExternalChange()).toBe(true)
      state.discardExternalChange()
      await flush()
      expect(state.content()).toBe('written by the agent')
      expect(state.externallyChanged()).toBe(false)
    } finally {
      dispose()
    }
  })
  it('keeps editing when the worktree changes but the open file did not', async () => {
    mockGetContext.mockResolvedValue({
      content: 'original',
    })
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTaskDetailState(
        {
          projectSlug: 'test-project',
          onClose: () => {},
        },
        stateDependencies(task),
      ),
      dispose: disposeRoot,
    }))
    try {
      await flush()
      state.setContent('my unsaved edit')
      await changeWorktree()
      expect(state.content()).toBe('my unsaved edit')
      expect(state.externallyChanged()).toBe(false)
      await state.saveAll()
      expect(state.confirmingExternalChange()).toBe(false)
    } finally {
      dispose()
    }
  })
  it('does not blank the editor while a background reload is in flight', async () => {
    mockGetContext.mockResolvedValue({
      content: 'original',
    })
    renderTask(makeTask('t-1-alpha', 'T-1', 'Alpha'))
    await flush()
    await flush()
    let resolveContext!: (value: { content: string }) => void
    mockGetContext.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveContext = resolve
        }),
    )
    setWorktreeRevision((revision) => revision + 1)
    await flush()
    await expectEditorText('original')
    resolveContext({
      content: 'refreshed',
    })
    await flush()
    await expectEditorText('refreshed')
    mockGetContext.mockResolvedValue({
      content: '',
    })
  })
})
describe('TaskDetailDialog multi-file upload confirmation', () => {
  beforeEach(() => {
    mockUploadFile.mockClear()
    mockUploadFile.mockResolvedValue(
      success({
        results: [],
      }),
    )
  })
  afterEach(() => {
    cleanup()
    mockGetTaskFiles.mockReset()
    mockGetTaskFiles.mockResolvedValue(emptyTaskFiles)
  })

  function makeLargeFile(name: string, sizeBytes: number): File {
    const buffer = new ArrayBuffer(sizeBytes)
    return new File([buffer], name, {
      type: 'application/octet-stream',
    })
  }

  it("processes each large file's size confirmation sequentially without overwriting", async () => {
    let uploadResolve: ((v: any) => void) | null = null
    mockUploadFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          uploadResolve = resolve
        }),
    )
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    const file1 = makeLargeFile('big1.dat', 20000)
    const file2 = makeLargeFile('big2.dat', 30000)
    const dropButton = screen.getByText('Drop a file to copy')
    fireEvent.drop(dropButton, {
      dataTransfer: {
        files: [file1, file2],
        length: 2,
      },
    })
    await flush()
    expect(screen.getByText(/big1\.dat/)).toBeTruthy()
    expect(screen.queryByText(/big2\.dat/)).toBeNull()
    const copyAnywayButton = screen.getByText('Copy Anyway')
    fireEvent.click(copyAnywayButton)
    await flush()
    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    uploadResolve!(
      success({
        results: [
          success({
            name: 'big1.dat',
          }),
        ],
      }),
    )
    await flush()
    expect(screen.getByText(/big2\.dat/)).toBeTruthy()
  })
  it('cancelling first file lets second file show its confirmation', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    const file1 = makeLargeFile('large1.dat', 20000)
    const file2 = makeLargeFile('large2.dat', 30000)
    const dropButton = screen.getByText('Drop a file to copy')
    fireEvent.drop(dropButton, {
      dataTransfer: {
        files: [file1, file2],
        length: 2,
      },
    })
    await flush()
    expect(screen.getByText(/large1\.dat/)).toBeTruthy()
    const fileText = screen.getByText(/large1\.dat/)
    const dialogContent = fileText.closest("[data-state='open']")!
    const cancelButton = dialogContent.querySelector('button')!
    fireEvent.click(cancelButton)
    await flush()
    expect(screen.getByText(/large2\.dat/)).toBeTruthy()
    expect(mockUploadFile).not.toHaveBeenCalled()
  })
  it('processes overwrite confirmations sequentially for multiple existing files', async () => {
    let uploadResolve: ((v: any) => void) | null = null
    mockUploadFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          uploadResolve = resolve
        }),
    )
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    task.fileNames = ['exist1.txt', 'exist2.txt']
    mockGetTaskFiles.mockResolvedValue({
      contextNames: [],
      fileNames: ['exist1.txt', 'exist2.txt'],
      references: [],
    })
    renderTask(task)
    await flush()
    await flush()
    const file1 = new File(['hello'], 'exist1.txt', {
      type: 'text/plain',
    })
    const file2 = new File(['world'], 'exist2.txt', {
      type: 'text/plain',
    })
    const dropButton = screen.getByText('Drop a file to copy')
    fireEvent.drop(dropButton, {
      dataTransfer: {
        files: [file1, file2],
        length: 2,
      },
    })
    await flush()
    expect(screen.getByText(/exist1\.txt/)).toBeTruthy()
    expect(screen.getByText('Overwrite File')).toBeTruthy()
    const overwriteButton = screen.getByText('Overwrite')
    fireEvent.click(overwriteButton)
    await flush()
    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    uploadResolve!(
      success({
        results: [
          success({
            name: 'exist1.txt',
          }),
        ],
      }),
    )
    await flush()
    expect(screen.getByText(/exist2\.txt/)).toBeTruthy()
    expect(screen.getByText('Overwrite File')).toBeTruthy()
  })
})
describe('TaskDetailDialog file list refresh after upload', () => {
  beforeEach(() => {
    mockUploadFile.mockClear()
  })
  afterEach(() => {
    cleanup()
    mockGetTaskFiles.mockReset()
    mockGetTaskFiles.mockResolvedValue(emptyTaskFiles)
  })

  async function renderAndDrop(file: File) {
    renderTask(makeTask('t-1-alpha', 'T-1', 'Alpha'))
    await flush()
    await flush()
    fireEvent.drop(screen.getByText('Drop a file to copy'), {
      dataTransfer: {
        files: [file],
        length: 1,
      },
    })
    await flush()
    await flush()
  }

  async function dropdownOptionLabels(): Promise<(string | null)[]> {
    fireEvent.click(screen.getByTestId('task-detail-editor-file-dropdown-trigger'))
    await flush()
    return screen.getAllByTestId('task-detail-editor-file-dropdown-option').map((el) => el.textContent)
  }

  it('a dropped .md file appears in the file dropdown immediately', async () => {
    mockGetTaskFiles.mockResolvedValue(emptyTaskFiles)
    mockUploadFile.mockImplementation(async () => {
      mockGetTaskFiles.mockResolvedValue({
        contextNames: ['notes'],
        fileNames: ['notes.md'],
        references: [],
      })
      return success({
        results: [
          success({
            name: 'notes.md',
          }),
        ],
      })
    })
    await renderAndDrop(
      new File(['# Notes'], 'notes.md', {
        type: 'text/markdown',
      }),
    )
    const options = await dropdownOptionLabels()
    expect(options.some((t) => t?.includes('notes.md'))).toBe(true)
  })
  it('a dropped non-markdown file appears in the file dropdown immediately', async () => {
    mockGetTaskFiles.mockResolvedValue(emptyTaskFiles)
    mockUploadFile.mockImplementation(async () => {
      mockGetTaskFiles.mockResolvedValue({
        contextNames: [],
        fileNames: ['report.txt'],
        references: [],
      })
      return success({
        results: [
          success({
            name: 'report.txt',
          }),
        ],
      })
    })
    await renderAndDrop(
      new File(['data'], 'report.txt', {
        type: 'text/plain',
      }),
    )
    const options = await dropdownOptionLabels()
    expect(options.some((t) => t?.includes('report.txt'))).toBe(true)
  })
})
describe('TaskDetailDialog context deletion clears extraFiles', () => {
  afterEach(() => {
    cleanup()
    mockGetContext.mockResolvedValue({
      content: '',
    })
    mockDeleteContext.mockResolvedValue(success(undefined))
  })
  it('deleting a context added via New markdown file removes it from the dropdown', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    const newFileButton = screen.getByText('New markdown file')
    fireEvent.click(newFileButton)
    await flush()
    const input = screen.getByPlaceholderText('e.g. design-notes')
    fireEvent.input(input, {
      target: {
        value: 'ghost-doc',
      },
    })
    await flush()
    const createButton = screen.getByText('Create')
    fireEvent.click(createButton)
    await flush()
    await flush()
    const dropdownButton = screen.getByText('ghost-doc.md')
    fireEvent.click(dropdownButton)
    await flush()
    const dropdownOptions = screen.getAllByRole('button').map((b) => b.textContent)
    expect(dropdownOptions.some((t) => t?.includes('ghost-doc.md'))).toBe(true)
    fireEvent.click(dropdownButton)
    await flush()
    const trashButton = screen.getByTitle('Delete file')
    fireEvent.click(trashButton)
    await flush()
    const deleteButton = screen.getByText('Delete')
    fireEvent.click(deleteButton)
    await flush()
    await flush()
    const currentLabel = screen.getByText('description.md')
    fireEvent.click(currentLabel)
    await flush()
    const optionsAfterDelete = screen.getAllByRole('button').map((b) => b.textContent)
    expect(optionsAfterDelete.some((t) => t?.includes('ghost-doc.md'))).toBe(false)
  })
})
describe('TaskDetailDialog shared launcher state', () => {
  it('reflects project storage changes in every open consumer', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    const { states, setProject, dispose } = createRoot((dispose) => {
      const [project, setProject] = createSignal<LauncherConfig>({
        ...emptyConfig,
        profiles: [
          {
            name: 'before',
            command: 'before',
          },
        ],
      })
      const deps = {
        ...stateDependencies(task),
        projectConfig: createStoredSignal(project, async (transform) => ({
          type: 'Success',
          value: transform(project()),
        })),
      }
      const states = [0, 1].map(() =>
        createTaskDetailState(
          {
            projectSlug: 'test-project',
            onClose: () => {},
          },
          deps,
        ),
      )
      return {
        states,
        setProject,
        dispose,
      }
    })
    try {
      await waitFor(() => expect(states.map((state) => state.launcherConfig()?.profiles[0].name)).toEqual(['before', 'before']))
      setProject({
        ...emptyConfig,
        profiles: [
          {
            name: 'after',
            command: 'after',
          },
        ],
      })
      await waitFor(() => expect(states.map((state) => state.launcherConfig()?.profiles[0].name)).toEqual(['after', 'after']))
    } finally {
      dispose()
    }
  })
  it('reacts to shared edits while retaining project overrides without reloading project data', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    const readProject = vi.fn(async () => ({
      projectConfig: {
        templates: [],
        skills: [],
        profiles: [
          {
            name: 'overridden',
            command: 'project',
          },
        ],
      },
      projectBoardId: null,
      projectName: '',
      projectPath: '',
      worktreeDir: '',
      agentWorktreeDir: '',
    }))
    const { state, sharedConfig, dispose } = createRoot((dispose) => {
      let saved: LauncherConfig = {
        ...emptyConfig,
        profiles: [
          {
            name: 'overridden',
            command: 'shared',
          },
        ],
      }
      const sharedConfig = createStoredSignal(
        () => saved,
        async (transform) => {
          saved = transform(saved)
          return {
            type: 'Success',
            value: saved,
          }
        },
      )
      const state = createTaskDetailState(
        {
          projectSlug: 'test-project',
          onClose: () => {},
        },
        {
          ...stateDependencies(task),
          sharedConfig,
          projectConfig: createStoredSignal(
            createMemo(async () => (await readProject()).projectConfig),
            async (transform) => ({
              type: 'Success',
              value: transform((await readProject()).projectConfig),
            }),
          ),
        },
      )
      return {
        state,
        sharedConfig,
        dispose,
      }
    })
    try {
      await waitFor(() => expect(state.launcherConfig()?.profiles[0].command).toBe('project'))
      await sharedConfig.update((current) => ({
        ...current,
        profiles: [
          {
            name: 'overridden',
            command: 'changed',
          },
          {
            name: 'new',
            command: 'new',
          },
        ],
      }))
      await waitFor(() => expect(state.launcherConfig()?.profiles.map((profile) => profile.command)).toEqual(['project', 'new']))
      expect(readProject).toHaveBeenCalledTimes(1)
    } finally {
      dispose()
    }
  })
})
describe('TaskDetailDialog initial tab', () => {
  afterEach(() => {
    cleanup()
    mockGetMergedLauncherConfig.mockResolvedValue({
      projectConfig: emptyConfig,
      templates: [],
      skills: [],
      profiles: [],
      shortcuts: [],
      columnDefaults: {},
      worktreeRootPath: null,
      conflictResolutionPrompt: '',
      projectBoardId: null,
      projectName: '',
      projectPath: '',
      worktreeDir: '',
      agentWorktreeDir: '',
    })
  })
  it('shows the task window without waiting for Launcher Config', () => {
    mockGetMergedLauncherConfig.mockReturnValue(new Promise(() => {}))
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    expect(screen.getByTestId('task-detail-number-input')).toBeTruthy()
  })
  it('shows the configured tab at start without flashing the editor first', async () => {
    mockGetMergedLauncherConfig.mockResolvedValue({
      ...emptyConfig,
      projectConfig: {
        ...emptyConfig,
        columnDefaults: {
          todo: {
            lastLayer: 'launcher',
            templateName: null,
            checkedSkills: [],
            profileName: null,
          },
        },
      },
      shortcuts: [],
      worktreeRootPath: null,
      conflictResolutionPrompt: '',
      projectBoardId: null,
      projectName: '',
      projectPath: '',
      worktreeDir: '',
      agentWorktreeDir: '',
      columnDefaults: {
        todo: {
          lastLayer: 'launcher',
        },
      },
    })
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    expect(screen.getByTestId('task-detail-launcher-profile-select')).toBeTruthy()
    expect(screen.queryByText('Drop a file to copy')).toBeNull()
  })
})
describe('TaskDetailDialog editable title', () => {
  beforeEach(() => {
    mockUpdateTask.mockClear()
  })
  afterEach(() => {
    cleanup()
  })

  function inputByTestId(testId: string): HTMLInputElement {
    const input = screen.getByTestId(testId)
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Expected ${testId} to be an input element`)
    }
    return input
  }

  it('Save button appears and saves header changes', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    const titleInput = inputByTestId('task-detail-title-input')
    fireEvent.input(titleInput, {
      target: {
        value: 'Beta',
      },
    })
    await flush()
    fireEvent.click(screen.getByTestId('task-detail-save-button'))
    await flush()
    expect(mockUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Beta',
      }),
    )
  })
  it('Escape after save reverts to saved value, not original prop', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    const titleInput = inputByTestId('task-detail-title-input')
    fireEvent.input(titleInput, {
      target: {
        value: 'Beta',
      },
    })
    await flush()
    fireEvent.click(screen.getByTestId('task-detail-save-button'))
    await flush()
    await flush()
    fireEvent.input(titleInput, {
      target: {
        value: 'Gamma',
      },
    })
    await flush()
    fireEvent.keyDown(titleInput, {
      key: 'Escape',
    })
    await flush()
    expect(titleInput.value).toBe('Beta')
  })
  it('Escape reverts inputs without saving', async () => {
    const task = makeTask('t-1-alpha', 'T-1', 'Alpha')
    renderTask(task)
    await flush()
    await flush()
    const titleInput = inputByTestId('task-detail-title-input')
    fireEvent.input(titleInput, {
      target: {
        value: 'Changed',
      },
    })
    fireEvent.keyDown(titleInput, {
      key: 'Escape',
    })
    await flush()
    expect(titleInput.value).toBe('Alpha')
    const numberInput = inputByTestId('task-detail-number-input')
    fireEvent.input(numberInput, {
      target: {
        value: 'X-9',
      },
    })
    fireEvent.keyDown(numberInput, {
      key: 'Escape',
    })
    await flush()
    expect(numberInput.value).toBe('T-1')
    expect(mockUpdateTask).not.toHaveBeenCalled()
  })
})
