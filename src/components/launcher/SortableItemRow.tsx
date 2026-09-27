import type { JSX } from '@solidjs/web'
import { createSortable } from '~/components/drag/drag-context.js'
import { DND_ACTIVE_CLASS } from '../board/dnd-shared.js'
import { type MergedLauncherItem } from './launcher-settings-row-types.js'
import { SettingsCard } from './SettingsCard.js'
import { SettingsRowContent } from './SettingsRowContent.js'

export function SortableItemRow(props: {
  item: MergedLauncherItem
  detail: string
  isActive: boolean
  onEdit: () => void
  onDelete: () => void
  rowTestId: string
  dragHandleTestId: string
  editTestId?: string
  deleteTestId?: string
}): JSX.Element {
  const sortable = createSortable(props.item.name)
  return (
    <SettingsCard
      ref={sortable.ref}
      data-testid={props.rowTestId}
      data-item-name={props.item.name}
      class={props.isActive ? DND_ACTIVE_CLASS : undefined}
    >
      <SettingsRowContent
        scope={props.item.scope}
        name={props.item.name}
        detail={props.detail}
        grip
        gripProps={sortable.dragActivators}
        dragHandleTestId={props.dragHandleTestId}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        editTestId={props.editTestId}
        deleteTestId={props.deleteTestId}
      />
    </SettingsCard>
  )
}
