import type { Result } from '../../util/result.js'
import type { ResponseEnvelope } from '@solidjs/web'
import type { ActionError } from '../../core/shared/errors.js'
import { action } from '@solidjs/router'
import { respond } from '@solidjs/web'
import { worktreeManager, projectRegistry, boardConfigManager } from '~/core/config/instances.js'
import { createTaskStore } from '~/core/task/task-store.js'
import { errorPayload, errorResult } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { failure, success } from '~/util/result.js'
import { resolveInitialTaskStatus } from '~/core/board/initial-task-status.js'
import { createForestLayoutStore, type ForestLayout } from '~/core/task/forest-layout-store.js'

export async function readForestLayout(projectSlug: string): Promise<ForestLayout> {
  'use server'

  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  return createForestLayoutStore(worktreeDir).read()
}

const actionResult = <T>(value: T) =>
  respond(value, {
    revalidate: [],
  })

export async function saveForestLayout(
  projectSlug: string,
  expected: ForestLayout,
  layout: ForestLayout,
): Promise<Result<ForestLayout, UserFacingError>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    createForestLayoutStore(worktreeDir).write(layout, expected)
    return success(layout)
  } catch (e) {
    return failure(errorPayload(e, 'Save forest layout failed'))
  }
}

export const addDependency = action(async function addDependency(input: {
  projectSlug: string
  folderName: string
  dependencyNumber: string
}): Promise<ResponseEnvelope<Result<undefined, ActionError>>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug)
    createTaskStore(worktreeDir).addDependency(input.folderName, input.dependencyNumber)
    return actionResult(success(undefined))
  } catch (e) {
    return actionResult(errorResult(e))
  }
}, 'add-forest-dependency')

export const removeDependencies = action(async function removeDependencies(input: {
  projectSlug: string
  removals: Array<{
    folderName: string
    dependencyNumber: string
  }>
}): Promise<ResponseEnvelope<Result<undefined, ActionError>>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug)
    const store = createTaskStore(worktreeDir) // One write per task: a projected edge can stand for several relations of
    // the same dependent, and rewriting its status file once per relation both
    // multiplies file contention and can leave the rest behind if one write fails.
    const byFolderName = new Map<string, string[]>()
    for (const removal of input.removals) {
      const numbers = byFolderName.get(removal.folderName) ?? []
      numbers.push(removal.dependencyNumber)
      byFolderName.set(removal.folderName, numbers)
    }
    for (const [folderName, dependencyNumbers] of byFolderName) {
      store.removeDependencies(folderName, dependencyNumbers)
    }
    return actionResult(success(undefined))
  } catch (e) {
    return actionResult(errorResult(e))
  }
}, 'remove-forest-dependencies')

export const createGroupTask = action(async function createGroupTask(input: {
  projectSlug: string
  number: string
  title: string
  memberFolderNames: string[]
  parentGroupNumber: string | null
  position: {
    x: number
    y: number
  } | null
}): Promise<ResponseEnvelope<Result<undefined, ActionError>>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug)
    const initialStatus = resolveInitialTaskStatus(input.projectSlug, {
      projectRegistry,
      boardConfigManager,
    })
    createTaskStore(worktreeDir).createGroup(
      input.number,
      input.title,
      initialStatus,
      input.memberFolderNames,
      input.parentGroupNumber ?? undefined,
      input.position ?? undefined,
    )
    return actionResult(success(undefined))
  } catch (e) {
    return actionResult(errorResult(e))
  }
}, 'create-forest-group')

export const ungroupTask = action(async function ungroupTask(input: {
  projectSlug: string
  folderName: string
}): Promise<ResponseEnvelope<Result<undefined, ActionError>>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug)
    createTaskStore(worktreeDir).ungroup(input.folderName)
    return actionResult(success(undefined))
  } catch (e) {
    return actionResult(errorResult(e))
  }
}, 'ungroup-forest-task')
