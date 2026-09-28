import { describe, it, expect, vi } from 'vitest'
import { createRoot, createSignal, flush, runWithOwner } from 'solid-js'
import { createBoardDnd as createProductionBoardDnd, type BoardDndResult } from '../../../src/components/board/board-state'
import type { HoverTarget } from '~/components/board/drop-index'
import type { BoardState } from '~/components/project/project-api.js'
import type { TaskInfo } from '~/core/task/task-store.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'

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

function makeBoard(
  tasks: TaskInfo[],
  columns: ColumnDefinition[] = [
    {
      name: 'todo',
    },
    {
      name: 'done',
    },
  ],
): BoardState {
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

function invoke<T>(fn: () => T): T {
  const result = runWithOwner(null, fn)
  flush()
  return result
}

interface TestBoardDndResult extends BoardDndResult {
  commands: BoardDndResult['commands'] & {
    updateHover: (target: HoverTarget) => void
    cancelDrag: () => void
  }
}

function createBoardDnd(getBoard: () => BoardState): TestBoardDndResult {
  const dnd = createProductionBoardDnd(getBoard)
  return {
    ...dnd,
    commands: {
      ...dnd.commands,
      updateHover(target) {
        const column = document.createElement('div')
        vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
        const activeId = dnd.drag().activeId
        const sourceInTarget = activeId?.startsWith(`${target.column}:`) === true
        const sourceIndex = dnd.board().taskOrder[target.column]?.indexOf(dnd.activeTask()!.folderName) ?? -1
        const count = target.index + (sourceInTarget && sourceIndex >= 0 && sourceIndex <= target.index ? 1 : 0)
        for (let index = 0; index < count; index++) {
          const card = document.createElement('div')
          card.setAttribute('data-drag-source', '')
          vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 10, 10))
          column.appendChild(card)
        }
        const unregister = dnd.commands.registerColumnRef(target.column, column)
        dnd.commands.handleDragMove({ draggable: { id: activeId!, node: column } })
        unregister()
      },
      cancelDrag() {
        dnd.commands.handleDragMove({ draggable: { id: dnd.drag().activeId! } })
        dnd.commands.endDrag()
      },
    },
  }
}

describe('createBoardDnd board view', () => {
  it('computes taskMap from board tasks', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'done',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { board } = createBoardDnd(b)
      expect(board().taskMap.size).toBe(2)
      expect(board().taskMap.get('t-1-alpha')?.status).toBe('todo')
      dispose()
    })
  })
  it('computes orphanedTasks for tasks with no matching column', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'deleted-col',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { board } = createBoardDnd(b)
      expect(board().orphanedTasks.map((t) => t.folderName)).toEqual(['t-2-bravo'])
      dispose()
    })
  })
  it('computes orphanFolderNames as a set', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'gone',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { board } = createBoardDnd(b)
      expect(board().orphanFolderNames.has('t-1-alpha')).toBe(true)
      dispose()
    })
  })
})
describe('createBoardDnd drag state', () => {
  it('initial drag state is idle', () => {
    createRoot((dispose) => {
      const [b] = createSignal(makeBoard([]))
      const { drag, activeTask } = createBoardDnd(b)
      expect(drag().activeId).toBeNull()
      expect(drag().hoverTarget).toBeNull()
      expect(activeTask()).toBeNull()
      dispose()
    })
  })
  it('startDrag sets activeId', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { drag, activeTask, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      expect(drag().activeId).toBe('todo:t-1-alpha')
      expect(activeTask()?.folderName).toBe('t-1-alpha')
      dispose()
    })
  })
  it('cancelDrag clears activeId and hoverTarget', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { drag, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'done',
          index: 0,
        }),
      )
      invoke(commands.cancelDrag)
      expect(drag().activeId).toBeNull()
      expect(drag().hoverTarget).toBeNull()
      dispose()
    })
  })
})
describe('createBoardDnd endDrag', () => {
  it('returns DropResult for cross-column drag', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'done',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'done',
          index: 1,
        }),
      )
      expect(invoke(commands.endDrag)).toEqual({
        folderName: 't-1-alpha',
        fromColumn: 'todo',
        toColumn: 'done',
        newIndex: 1,
      })
      dispose()
    })
  })
  it('returns DropResult for same-column reorder', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-3-charlie',
          status: 'todo',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'todo',
          index: 2,
        }),
      )
      expect(invoke(commands.endDrag)).toEqual({
        folderName: 't-1-alpha',
        fromColumn: 'todo',
        toColumn: 'todo',
        newIndex: 2,
      })
      dispose()
    })
  })
  it('returns null for same-position drop', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'todo',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'todo',
          index: 0,
        }),
      )
      expect(invoke(commands.endDrag)).toBeNull()
      dispose()
    })
  })
  it('returns null when no hoverTarget', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      expect(invoke(commands.endDrag)).toBeNull()
      dispose()
    })
  })
  it('rejects drop into undefined column', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'gone',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'undefined',
          index: 0,
        }),
      )
      expect(invoke(commands.endDrag)).toBeNull()
      dispose()
    })
  })
  it('clears drag state after drop', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'done',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { drag, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'done',
          index: 0,
        }),
      )
      invoke(commands.endDrag)
      expect(drag().activeId).toBeNull()
      expect(drag().hoverTarget).toBeNull()
      dispose()
    })
  })
  it('shows the dropped position immediately while persisted order is still unchanged', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'done',
        }),
      ]
      const [b] = createSignal(makeBoard(tasks))
      const { board, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'done',
          index: 1,
        }),
      )
      invoke(commands.endDrag)
      expect(board().taskOrder['todo']).toEqual([])
      expect(board().taskOrder['done']).toEqual(['t-2-bravo', 't-1-alpha'])
      expect(b().taskOrder['todo']).toEqual(['t-1-alpha'])
      expect(b().taskOrder['done']).toEqual(['t-2-bravo'])
      dispose()
    })
  })
})
describe('createBoardDnd server sync', () => {
  it('keeps status and order together across stale refreshes, then rolls back a failed drop', () => {
    createRoot((dispose) => {
      const task = makeTask({ folderName: 't-1-alpha', status: 'removed-column' })
      const [b, setB] = createSignal(makeBoard([task]))
      const { board, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('undefined:t-1-alpha'))
      invoke(() => commands.updateHover({ column: 'done', index: 0 }))
      const drop = invoke(commands.endDrag)!
      invoke(() => setB(makeBoard([task])))
      expect(board().taskOrder['done']).toEqual(['t-1-alpha'])
      expect(board().taskMap.get('t-1-alpha')?.status).toBe('done')
      expect(board().orphanedTasks).toEqual([])
      invoke(() => commands.removePendingDrop(drop))
      expect(board().taskOrder['done']).toEqual([])
      expect(board().orphanedTasks.map((item) => item.folderName)).toEqual(['t-1-alpha'])
      dispose()
    })
  })
  it('keeps a newer drop visible when an earlier drop settles', () => {
    createRoot((dispose) => {
      const task = makeTask({ folderName: 't-1-alpha' })
      const [b, setB] = createSignal(makeBoard([task]))
      const { board, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() => commands.updateHover({ column: 'done', index: 0 }))
      const first = invoke(commands.endDrag)!
      invoke(() => commands.startDrag('done:t-1-alpha'))
      invoke(() => commands.updateHover({ column: 'todo', index: 0 }))
      const second = invoke(commands.endDrag)!
      invoke(() => setB(makeBoard([{ ...task, status: 'done' }])))
      invoke(() => commands.removePendingDrop(first))
      expect(board().taskOrder['todo']).toEqual(['t-1-alpha'])
      expect(board().taskOrder['done']).toEqual([])
      expect(board().taskMap.get('t-1-alpha')?.status).toBe('todo')
      invoke(() => setB(makeBoard([task])))
      invoke(() => commands.removePendingDrop(second))
      expect(board().taskOrder['todo']).toEqual(['t-1-alpha'])
      expect(board().taskOrder['done']).toEqual([])
      dispose()
    })
  })
  it('reads replacement task order', () => {
    createRoot((dispose) => {
      const tasks = [
        makeTask({
          folderName: 't-1-alpha',
          status: 'todo',
        }),
        makeTask({
          folderName: 't-2-bravo',
          status: 'done',
        }),
        makeTask({
          folderName: 't-3-charlie',
          status: 'done',
        }),
      ]
      const [b, setB] = createSignal(makeBoard(tasks))
      const { board, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'done',
          index: 0,
        }),
      )
      const drop = invoke(commands.endDrag)!
      expect(board().taskOrder['done']).toEqual(['t-1-alpha', 't-2-bravo', 't-3-charlie'])
      const serverOrder = {
        todo: [],
        done: ['t-3-charlie', 't-1-alpha', 't-2-bravo'],
      }
      invoke(() =>
        setB({
          columns: b().columns,
          tasks: b().tasks,
          taskOrder: serverOrder,
        }),
      )
      invoke(() => commands.removePendingDrop(drop))
      expect(board().taskOrder['done']).toEqual(['t-3-charlie', 't-1-alpha', 't-2-bravo'])
      dispose()
    })
  })
  it('new tasks appear after server sync', () => {
    createRoot((dispose) => {
      const taskA = makeTask({
        folderName: 't-1-alpha',
        status: 'todo',
      })
      const taskB = makeTask({
        folderName: 't-2-bravo',
        status: 'done',
      })
      const [b, setB] = createSignal(makeBoard([taskA, taskB]))
      const { board, commands } = createBoardDnd(b)
      invoke(() => commands.startDrag('todo:t-1-alpha'))
      invoke(() =>
        commands.updateHover({
          column: 'done',
          index: 0,
        }),
      )
      invoke(commands.endDrag)
      const taskC = makeTask({
        folderName: 't-3-charlie',
        status: 'todo',
      })
      invoke(() => setB(makeBoard([taskA, taskB, taskC])))
      expect(board().taskMap.has('t-3-charlie')).toBe(true)
      dispose()
    })
  })
})
