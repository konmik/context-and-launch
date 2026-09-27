import type { JSX } from '@solidjs/web'
import { DragPreview } from '../board/DragPreview.js'
import type { ColumnDefinition } from '~/core/project/board-config.js'
import { SETTINGS_CARD_CLASS } from './SettingsCard.js'
import { SettingsRowContent } from './SettingsRowContent.js'

export function ColumnDropPreview(props: { column: ColumnDefinition }): JSX.Element {
  return (
    <DragPreview class={SETTINGS_CARD_CLASS}>
      <SettingsRowContent name={props.column.name} detail={props.column.description} grip />
    </DragPreview>
  )
}
