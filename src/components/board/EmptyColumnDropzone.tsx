import type { JSX } from '@solidjs/web'
import { createDroppable } from '~/components/drag/drag-context.js'
import { COLUMN_PREFIX } from './kanban-id.js'

export function EmptyColumnDropzone(props: { column: string }): JSX.Element {
  const droppable = createDroppable(COLUMN_PREFIX + props.column)
  return <div ref={droppable.ref} class="flex-1" data-testid="kanban-board-empty-dropzone" data-column-name={props.column} />
}
