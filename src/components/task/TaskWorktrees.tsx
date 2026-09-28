import type { JSX } from '@solidjs/web'
import { For, createSignal, useContext } from 'solid-js'
import { useAction } from '@solidjs/router'
import { taskAgentWorktrees } from '~/core/task/task-worktrees.js'
import { addTaskWorktree, selectTaskWorktree } from './task-api.js'
import { TaskStatusContext } from './task-status-storage.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { ChevronDown } from '../ui/icons/ChevronDown.js'

export function TaskWorktrees(props: { projectSlug: string }): JSX.Element {
  const status = useContext(TaskStatusContext)!
  const errors = useErrorReporter()
  const add = useAction(addTaskWorktree)
  const select = useAction(selectTaskWorktree)
  const [busy, setBusy] = createSignal(false)

  async function updateWorktree(operation: () => ReturnType<typeof add>): Promise<void> {
    if (busy()) return
    setBusy(true)
    try {
      await errors.runAndReportErrors(async () => {
        const result = await operation()
        if (result.type === 'Failure') return result
        return status.refresh()
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex min-w-0 items-center gap-2" aria-label="Task worktrees">
      <label for="task-worktree-selection" class="sr-only">
        Launch target
      </label>
      <div class="relative min-w-0 flex-1">
        <select
          id="task-worktree-selection"
          aria-label="Launch target"
          class="worktree-select w-full min-w-0 truncate rounded border border-input bg-background p-2 pr-8 text-left text-xs"
          dir="rtl"
          disabled={busy()}
          value={status.get().useWorktree ? (status.get().agentWorktreeDir ?? '') : ''}
          onChange={(event) => {
            const worktreePath = event.currentTarget.value || null
            void updateWorktree(() => select(props.projectSlug, status.get().folderName, worktreePath))
          }}
        >
          <option value="">Project directory</option>
          <For
            each={taskAgentWorktrees(status.get())
              .filter((entry) => !entry.removed)
              .map((entry) => entry.worktreePath)}
          >
            {(worktreePath) => <option value={worktreePath}>{worktreePath}</option>}
          </For>
        </select>
        <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
          <ChevronDown size={14} />
        </span>
      </div>
      <button
        type="button"
        class="btn-secondary shrink-0"
        disabled={busy()}
        onClick={() => void updateWorktree(() => add(props.projectSlug, status.get().folderName))}
      >
        Add worktree
      </button>
    </div>
  )
}
