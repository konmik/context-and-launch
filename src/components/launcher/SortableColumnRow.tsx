import type { JSX } from '@solidjs/web'
import { createSortable } from '~/components/drag/drag-context.js'
import { DND_ACTIVE_CLASS } from '../board/dnd-shared.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import { SettingsCard } from './SettingsCard.js'
import { SettingsRowContent } from './SettingsRowContent.js'

export function SortableColumnRow(props: {
  column: ColumnDefinition
  isActive: boolean
  onEdit: () => void
  onDelete: () => void
}): JSX.Element {
  const sortable = createSortable(props.column.name)
  return (
    <SettingsCard
      ref={sortable.ref}
      data-testid="launcher-settings-columns-row"
      data-column-name={props.column.name}
      class={props.isActive ? DND_ACTIVE_CLASS : undefined}
    >
      <SettingsRowContent
        name={props.column.name}
        detail={props.column.description}
        grip
        gripProps={sortable.dragActivators}
        dragHandleTestId="launcher-settings-columns-drag-handle"
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        editTestId="launcher-settings-columns-edit-button"
        deleteTestId="launcher-settings-columns-delete-button"
      />
    </SettingsCard>
  )
}
