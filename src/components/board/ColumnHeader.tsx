import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import { COLUMN_CELL_CLASS } from './ticket-column.js'

export function ColumnHeader(props: { column: ColumnDefinition; count: number; edgeLeft?: boolean; edgeRight?: boolean }): JSX.Element {
  return (
    <div class={COLUMN_CELL_CLASS} data-testid="kanban-board-column-header-cell" data-column-name={props.column.name}>
      <div
        class={`mb-3 h-2 ${props.edgeLeft ? '-ml-8' : '-ml-4'} ${props.edgeRight ? '-mr-8' : '-mr-4'}`}
        style={{
          'background-color': props.column.color ?? 'transparent',
        }}
        data-testid="kanban-board-column-color-line"
        data-column-name={props.column.name}
      />
      <div class="mb-3 flex items-center gap-2">
        <h3
          class="label-mono text-sm font-semibold text-foreground"
          data-testid="kanban-board-column-header"
          data-column-name={props.column.name}
        >
          {props.column.name}
        </h3>
        <span class="label-mono text-xs text-muted-foreground">[{props.count}]</span>
      </div>
      <Show when={props.column.description}>
        <p class="-mt-3 mb-5 text-xs text-muted-foreground" data-testid="kanban-board-column-description">
          {props.column.description}
        </p>
      </Show>
    </div>
  )
}
