import type { JSX } from '@solidjs/web'
import { For, Show } from 'solid-js'
import { MenuItem, MenuSeparator } from '../ui/menu'

interface TicketActionCallbacks {
  onOpenFolder?: () => void
  onOpenWorktree?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onReviewChanges?: () => void
  onRunShortcut: (shortcutName: string) => void
}

interface TicketActionItemsProps {
  hasAgentWorktree: boolean
  shortcuts: { name: string }[]
  isShortcutRunning: boolean
  hasUnsavedChanges?: boolean
  callbacks: TicketActionCallbacks
}

export default function TicketActionItems(props: TicketActionItemsProps): JSX.Element {
  return (
    <>
      <MenuItem
        value="open-ticket-folder"
        data-testid="ticket-actions-open-folder"
        disabled={!props.callbacks.onOpenFolder}
        onClick={() => props.callbacks.onOpenFolder?.()}
      >
        Open ticket folder
      </MenuItem>
      <Show when={props.hasAgentWorktree}>
        <MenuItem
          value="open-worktree"
          data-testid="ticket-actions-open-worktree"
          disabled={!props.callbacks.onOpenWorktree}
          onClick={() => props.callbacks.onOpenWorktree?.()}
        >
          Open worktree folder
        </MenuItem>
      </Show>
      <MenuSeparator />
      <MenuItem
        value="archive"
        data-testid="ticket-actions-archive"
        disabled={props.hasUnsavedChanges || !props.callbacks.onArchive}
        onClick={() => props.callbacks.onArchive?.()}
      >
        Archive
      </MenuItem>
      <MenuItem
        value="delete"
        class="text-destructive"
        data-testid="ticket-actions-delete"
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
            data-testid="ticket-actions-review-changes"
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
              data-testid="ticket-actions-shortcut"
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
