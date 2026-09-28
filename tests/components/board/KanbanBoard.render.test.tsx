import type { RenderResult } from '../../test-render.js'
import { describe, it, expect, afterEach } from 'vitest'
import { renderWithErrors as render, screen, cleanup, waitFor } from '../../test-render.js'
import { createSignal, createMemo, Loading, type ComponentProps } from 'solid-js'
import { createStoredSignal } from '~/util/stored-signal.js'
import { success } from '~/util/result.js'
import KanbanBoard from '../../../src/components/board/KanbanBoard'
import { TaskOrderContext } from '../../../src/components/board/task-order-storage.js'
import type { BoardState } from '~/components/project/project-api.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import type { HerdrAgentStatus } from '~/core/herdr/herdr-client.js'
import { HerdrStatusesContext } from '~/components/task/herdr-statuses-context.js'

afterEach(() => cleanup())

function makeTask(
  overrides: Partial<TaskInfo> & {
    folderName: string
  },
): TaskInfo {
  return {
    number: overrides.number ?? 'T-1',
    title: overrides.title ?? 'Test task',
    status: overrides.status ?? 'todo',
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  }
}

function testColumns(...names: string[]): ColumnDefinition[] {
  return names.map((name) => ({
    name,
  }))
}

function makeBoard(tasks: TaskInfo[], columns: ColumnDefinition[] = testColumns('todo', 'done')): BoardState {
  const colNames = columns.map((c) => c.name)
  const taskOrder: Record<string, string[]> = {}
  for (const col of colNames) {
    taskOrder[col] = tasks.filter((t) => t.status === col).map((t) => t.folderName)
  }
  return {
    columns,
    tasks,
    taskOrder,
  }
}

const noop = () => {}

function renderBoard(
  board: BoardState,
  opts: {
    herdrStatuses?: Record<string, HerdrAgentStatus>
    dragState?: ComponentProps<typeof KanbanBoard>['dragState']
    activeTask?: ComponentProps<typeof KanbanBoard>['activeTask']
  } = {},
): RenderResult {
  return render(() => (
    <HerdrStatusesContext value={(folderName) => opts.herdrStatuses?.[folderName]}>
      <TaskOrderContext
        value={createStoredSignal(
          () => board.taskOrder,
          async (transform) => success(transform(board.taskOrder)),
        )}
      >
        <KanbanBoard
          board={board}
          projectSlug="test"
          onDelete={noop}
          onViewDetail={noop}
          onArchive={noop}
          dragState={opts.dragState}
          activeTask={opts.activeTask}
        />
      </TaskOrderContext>
    </HerdrStatusesContext>
  ))
}

describe('KanbanBoard rendering', () => {
  it('keeps an open task menu when refreshed data replaces task objects', async () => {
    const [tasks, setTasks] = createSignal([
      makeTask({
        folderName: 'task',
      }),
    ])
    const board = makeBoard(tasks())
    renderBoard({
      ...board,
      get tasks() {
        return tasks()
      },
    })
    const card = screen.getByTestId('kanban-board-task-card')
    screen.getByTestId('kanban-board-task-menu-trigger').click()
    await waitFor(() => expect(screen.getByTestId('task-actions-archive')).toBeTruthy())
    setTasks((current) =>
      current.map((task) => ({
        ...task,
        title: 'Refreshed title',
      })),
    )
    await waitFor(() => expect(screen.getByText('Refreshed title')).toBeTruthy())
    expect(screen.getByTestId('kanban-board-task-card')).toBe(card)
    expect(screen.getByTestId('task-actions-archive')).toBeTruthy()
  })
  it('updates columns from a reactive board definition', async () => {
    const [columns, setColumns] = createSignal(testColumns('todo', 'done'))
    renderBoard({
      get columns() {
        return columns()
      },
      tasks: [],
      taskOrder: {},
    })
    setColumns(testColumns('todo', 'done', 'review'))
    await waitFor(() => expect(screen.getByText('review')).toBeTruthy())
  })
  it('updates columns after asynchronous storage initialization', async () => {
    let saved = testColumns('todo', 'done')
    const initial = createMemo(async () => saved)
    const storage = createStoredSignal(initial, async (transform) => {
      saved = transform(saved)
      return success(saved)
    })
    render(() => (
      <Loading>
        <TaskOrderContext
          value={createStoredSignal(
            () => ({}),
            async (transform) => success(transform({})),
          )}
        >
          <KanbanBoard
            board={{
              columns: storage.get(),
              tasks: [],
              taskOrder: {},
            }}
            projectSlug="test"
            onDelete={noop}
            onViewDetail={noop}
            onArchive={noop}
          />
        </TaskOrderContext>
      </Loading>
    ))
    await waitFor(() => expect(screen.getByText('todo')).toBeTruthy())
    await storage.update((columns) => [
      ...columns,
      {
        name: 'review',
      },
    ])
    await waitFor(() => expect(screen.getByText('review')).toBeTruthy())
  })
  it('renders column headers', () => {
    const board = makeBoard([], testColumns('todo', 'in-progress', 'done'))
    renderBoard(board)
    expect(screen.getByText('todo')).toBeTruthy()
    expect(screen.getByText('in-progress')).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
  })
  it('renders task cards in correct columns', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
      makeTask({
        folderName: 't-2-bravo',
        number: 'T-2',
        title: 'Bravo',
        status: 'done',
      }),
    ]
    const board = makeBoard(tasks)
    renderBoard(board)
    expect(screen.getByText('T-1')).toBeTruthy()
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('T-2')).toBeTruthy()
    expect(screen.getByText('Bravo')).toBeTruthy()
  })
  it('hides drop preview in empty columns when not dragging', () => {
    const board = makeBoard([], testColumns('todo', 'done'))
    const { container } = renderBoard(board)
    expect(container.querySelectorAll('[data-drop-indicator]').length).toBe(0)
  })
  it('each task card wrapper has a data-sortable-id for hover target matching', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
      makeTask({
        folderName: 't-2-bravo',
        number: 'T-2',
        title: 'Bravo',
        status: 'todo',
      }),
    ]
    const board = makeBoard(tasks)
    const { container } = renderBoard(board)
    const sortables = container.querySelectorAll('[data-sortable-id]')
    expect(sortables.length).toBe(2)
    expect(sortables[0].getAttribute('data-sortable-id')).toBe('todo:t-1-alpha')
    expect(sortables[1].getAttribute('data-sortable-id')).toBe('todo:t-2-bravo')
  })
})
describe('KanbanBoard same-column drop preview', () => {
  it('opens a slot at the top when dragging the lower task above the upper one', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
      makeTask({
        folderName: 't-2-bravo',
        number: 'T-2',
        title: 'Bravo',
        status: 'todo',
      }),
    ]
    const board = makeBoard(tasks)
    const dragState = () => ({
      activeId: 'todo:t-2-bravo',
      hoverTarget: {
        column: 'todo',
        index: 0,
      },
    })
    const activeTask = () => tasks[1]
    const { container } = renderBoard(board, {
      dragState,
      activeTask,
    })
    const indicators = container.querySelectorAll('[data-drop-indicator]')
    expect(indicators.length).toBe(1)
    const firstCard = container.querySelector('[data-sortable-id]')!
    const precedesFirstCard = indicators[0].compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(precedesFirstCard).toBeTruthy()
  })
})
describe('KanbanBoard column descriptions', () => {
  it('renders description when present', () => {
    const board = makeBoard(
      [],
      [
        {
          name: 'todo',
          description: 'Work items',
        },
        {
          name: 'done',
        },
      ],
    )
    const { container } = renderBoard(board)
    const desc = container.querySelector('[data-testid="kanban-board-column-description"]')
    expect(desc).toBeTruthy()
    expect(desc!.textContent).toBe('Work items')
  })
  it('does not render description when absent', () => {
    const board = makeBoard([], testColumns('todo', 'done'))
    const { container } = renderBoard(board)
    expect(container.querySelectorAll('[data-testid="kanban-board-column-description"]').length).toBe(0)
  })
})
describe('KanbanBoard undefined column', () => {
  it('renders undefined column for orphaned tasks', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'deleted-col',
      }),
    ]
    const board = makeBoard(tasks, testColumns('todo', 'done'))
    const { container } = renderBoard(board)
    const undefinedCol = container.querySelector('[data-testid="kanban-board-undefined-column"]')
    expect(undefinedCol).toBeTruthy()
    expect(undefinedCol!.textContent).toContain('undefined')
  })
  it('undefined column has red styling', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'gone',
      }),
    ]
    const board = makeBoard(tasks, testColumns('todo'))
    const { container } = renderBoard(board)
    const undefinedCol = container.querySelector('[data-testid="kanban-board-undefined-column"]')
    expect(undefinedCol!.className).toContain('border-destructive')
  })
  it('shows orphaned status text in red', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'vanished',
      }),
    ]
    const board = makeBoard(tasks, testColumns('todo'))
    const { container } = renderBoard(board)
    const orphanedStatus = container.querySelector('[data-testid="kanban-board-task-orphaned-status"]')
    expect(orphanedStatus).toBeTruthy()
    expect(orphanedStatus!.textContent).toBe('vanished')
  })
  it('does not render undefined column when no orphaned tasks', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
    ]
    const board = makeBoard(tasks, testColumns('todo', 'done'))
    const { container } = renderBoard(board)
    expect(container.querySelector('[data-testid="kanban-board-undefined-column"]')).toBeNull()
  })
})
describe('KanbanBoard column color lines', () => {
  it('draws a color line per column (transparent when uncolored) and no card swatches', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
      makeTask({
        folderName: 't-2-bravo',
        number: 'T-2',
        title: 'Bravo',
        status: 'done',
      }),
    ]
    const board = makeBoard(tasks, [
      {
        name: 'todo',
        color: '#0969da',
      },
      {
        name: 'done',
      },
    ])
    const { container } = renderBoard(board)
    expect(container.querySelectorAll('[data-testid="status-swatch"]').length).toBe(0)
    const line = (name: string): HTMLElement => {
      const element = container.querySelector<HTMLElement>(`[data-testid="kanban-board-column-color-line"][data-column-name="${name}"]`)
      if (!element) throw new Error(`Expected color line for ${name}`)
      return element
    }
    expect(line('todo').style.backgroundColor).toBe('rgb(9, 105, 218)')
    expect(line('done').style.backgroundColor).toBe('transparent')
  })
})
describe('KanbanBoard herdr icons', () => {
  it('renders one icon for a task with a herdr status', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
    ]
    const board = makeBoard(tasks, testColumns('todo', 'done'))
    const { container } = renderBoard(board, {
      herdrStatuses: {
        't-1-alpha': 'blocked',
      },
    })
    const icons = container.querySelectorAll('[data-testid="herdr-status-icon"]')
    expect(icons.length).toBe(1)
    expect(icons[0].getAttribute('data-herdr-status')).toBe('blocked')
  })
  it('renders no icons when herdrStatuses is omitted', () => {
    const tasks = [
      makeTask({
        folderName: 't-1-alpha',
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
      }),
    ]
    const board = makeBoard(tasks, testColumns('todo', 'done'))
    const { container } = renderBoard(board)
    expect(container.querySelectorAll('[data-testid="herdr-status-icon"]').length).toBe(0)
  })
})
