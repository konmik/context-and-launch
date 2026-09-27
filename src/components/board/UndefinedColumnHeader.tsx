import type { JSX } from '@solidjs/web'

export function UndefinedColumnHeader(): JSX.Element {
  return (
    <div
      class={'flex min-w-[250px] flex-1 flex-col rounded-t-md ' + 'border border-b-0 border-destructive px-3 pt-3'}
      data-testid="kanban-board-undefined-column"
    >
      <h3 class="label-mono mb-1 text-sm font-semibold text-destructive">undefined</h3>
      <p class="mb-2 text-xs text-destructive/80" data-testid="kanban-board-undefined-column-description">
        Update manually
      </p>
    </div>
  )
}
