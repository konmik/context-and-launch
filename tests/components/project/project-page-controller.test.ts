import { describe, expect, it, vi } from 'vitest'
import { createRoot, flush } from 'solid-js'
import type { TaskInfo } from '~/core/task/task-store.js'
import { createProjectPageController } from '../../../src/components/project/project-page-controller.js'

function task(): TaskInfo {
  return {
    number: 'T-1',
    title: 'Alpha',
    status: 'todo',
    folderName: 't-1-alpha',
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
  }
}

describe('ProjectPageController task detail', () => {
  it('selects the clicked task without waiting for project refresh', () => {
    const clicked = task()
    const { controller, dispose } = createRoot((dispose) => ({
      controller: createProjectPageController({
        onError: vi.fn(),
        projectSlug: () => 'test-project',
        data: () => ({
          status: 'loaded',
          projects: [],
          projectSlug: 'test-project',
          suggestedNextNumber: null,
          board: {
            columns: [],
            tasks: [clicked],
            taskOrder: {},
          },
        }),
        runSyncTasks: () => new Promise(() => {}),
      }),
      dispose,
    }))
    void controller.commands.openDetail(clicked)
    flush()
    expect(controller.selectionState().detailTask).toBe(clicked)
    dispose()
  })
  it('selects a worktree task for review', () => {
    const clicked = {
      ...task(),
      hasAgentWorktree: true,
    }
    const { controller, dispose } = createRoot((dispose) => ({
      controller: createProjectPageController({
        onError: vi.fn(),
        projectSlug: () => 'test-project',
        data: () => ({
          status: 'loaded',
          projects: [],
          projectSlug: 'test-project',
          suggestedNextNumber: null,
          board: {
            columns: [],
            tasks: [clicked],
            taskOrder: {},
          },
        }),
        runSyncTasks: () => new Promise(() => {}),
      }),
      dispose,
    }))
    controller.commands.openReview(clicked)
    flush()
    expect(controller.selectionState().reviewTask).toBe(clicked)
    dispose()
  })
})
