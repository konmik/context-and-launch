import type { JSX } from '@solidjs/web'
import { For, Show } from 'solid-js'
import { MenuItem } from '../ui/MenuItem.js'
import { MenuSeparator } from '../ui/MenuSeparator.js'

interface TaskActionCallbacks {
  onOpenFolder?: () => void
  onOpenWorktree?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onReviewChanges?: () => void
  onRunShortcut: (shortcutName: string) => void
}

interface TaskActionItemsProps {
  hasAgentWorktree: boolean
  shortcuts: {
    name: string
  }[]
  isShortcutRunning: boolean
  hasUnsavedChanges?: boolean
  callbacks: TaskActionCallbacks
}

export default function TaskActionItems(props: TaskActionItemsProps): JSX.Element {
  return (
    <>
      <MenuItem
        value="open-task-folder"
        data-testid="task-actions-open-folder"
        disabled={!props.callbacks.onOpenFolder}
        onClick={() => props.callbacks.onOpenFolder?.()}
      >
        Open task folder
      </MenuItem>
      <Show when={props.hasAgentWorktree}>
        <MenuItem
          value="open-worktree"
          data-testid="task-actions-open-worktree"
          disabled={!props.callbacks.onOpenWorktree}
          onClick={() => props.callbacks.onOpenWorktree?.()}
        >
          Open worktree folder
        </MenuItem>
      </Show>
      <MenuSeparator />
      <MenuItem
        value="archive"
        data-testid="task-actions-archive"
        disabled={props.hasUnsavedChanges || !props.callbacks.onArchive}
        onClick={() => props.callbacks.onArchive?.()}
      >
        Archive
      </MenuItem>
      <MenuItem
        value="delete"
        class="text-destructive"
        data-testid="task-actions-delete"
        disabled={props.hasUnsavedChanges || !props.callbacks.onDelete}
        onClick={() => props.callbacks.onDelete?.()}
      >
        Delete
      </MenuItem>
      <Show when={(props.hasAgentWorktree && props.callbacks.onReviewChanges) || props.shortcuts.length > 0}>
        <MenuSeparator />
        <Show when={props.hasAgentWorktree && props.callbacks.onReviewChanges}>
          <MenuItem
            value="review-changes"
            data-testid="task-actions-review-changes"
            disabled={props.hasUnsavedChanges}
            onClick={() => props.callbacks.onReviewChanges?.()}
          >
            Diff Review
          </MenuItem>
        </Show>
        <For each={props.shortcuts}>
          {(shortcut) => (
            <MenuItem
              value={`shortcut-${shortcut.name}`}
              data-testid="task-actions-shortcut"
              data-shortcut-name={shortcut.name}
              disabled={props.isShortcutRunning}
              onClick={() => props.callbacks.onRunShortcut(shortcut.name)}
            >
              {shortcut.name}
            </MenuItem>
          )}
        </For>
      </Show>
    </>
  )
}
