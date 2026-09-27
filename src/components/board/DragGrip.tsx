import type { JSX } from '@solidjs/web'
import { GripVertical } from '~/components/ui/icons/GripVertical.js'
import type { DragActivators } from '~/components/drag/drag-context.js'

export function DragGrip(props: { gripProps?: DragActivators; testId: string }): JSX.Element {
  return (
    <span
      onPointerDown={props.gripProps?.onPointerDown}
      onKeyDown={props.gripProps?.onKeyDown}
      role="button"
      tabindex="0"
      aria-label="Drag to reorder"
      class="cursor-grab text-muted-foreground"
      data-testid={props.testId}
    >
      <GripVertical size={14} />
    </span>
  )
}
