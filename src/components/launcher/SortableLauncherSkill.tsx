import type { JSX } from '@solidjs/web'
import { createSortable } from '~/components/drag/drag-context.js'
import { DragGrip } from '../board/DragGrip.js'
import { DND_ACTIVE_CLASS } from '../board/dnd-shared.js'
import type { MergedSkill } from './launcher-settings-row-types.js'

export function SortableLauncherSkill(props: {
  skill: MergedSkill
  checked: boolean
  isActive: boolean
  onToggle: () => void
}): JSX.Element {
  const sortable = createSortable(props.skill.name)
  return (
    <div
      ref={sortable.ref}
      data-testid="launcher-skill-row"
      data-skill-name={props.skill.name}
      class={`flex items-center gap-2 ${props.isActive ? DND_ACTIVE_CLASS : ''}`}
    >
      <DragGrip gripProps={sortable.dragActivators} testId="launcher-skill-drag-handle" />
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={props.onToggle}
          class="rounded border-input"
          data-testid="task-detail-launcher-skill-checkbox"
          data-skill-name={props.skill.name}
        />
        {props.skill.name}
      </label>
    </div>
  )
}
