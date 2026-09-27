import { Show } from 'solid-js'
import type { JSX } from '@solidjs/web'
import type { DragActivators } from '~/components/drag/drag-context.js'
import { DragGrip } from '../board/DragGrip.js'
import { ScopeBadge } from './ScopeBadge.js'

export function SettingsRowContent(props: {
  name: string
  detail?: string
  scope?: string
  grip?: boolean
  gripProps?: DragActivators
  dragHandleTestId?: string
  onEdit?: () => void
  onDelete?: () => void
  editTestId?: string
  deleteTestId?: string
}): JSX.Element {
  return (
    <>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <Show when={props.grip}>
          <DragGrip gripProps={props.gripProps} testId={props.dragHandleTestId ?? 'launcher-settings-skills-drag-handle'} />
        </Show>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{props.name}</span>
            <Show when={props.scope}>{(scope) => <ScopeBadge scope={scope()} />}</Show>
          </div>
          <Show when={props.detail}>
            <p class="mt-1 truncate text-xs text-muted-foreground">{props.detail}</p>
          </Show>
        </div>
      </div>
      <div class="flex shrink-0 gap-1">
        <button onClick={props.onEdit} class="btn-secondary btn-sm" data-testid={props.editTestId}>
          Edit
        </button>
        <button
          onClick={props.onDelete}
          class={'btn-secondary btn-sm text-destructive ' + 'hover:bg-destructive hover:text-destructive-foreground'}
          data-testid={props.deleteTestId}
        >
          Delete
        </button>
      </div>
    </>
  )
}
