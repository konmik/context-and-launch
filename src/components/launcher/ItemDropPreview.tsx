import type { JSX } from '@solidjs/web'
import { DragPreview } from '../board/DragPreview.js'
import { type MergedLauncherItem } from './launcher-settings-row-types.js'
import { SETTINGS_CARD_CLASS } from './SettingsCard.js'
import { SettingsRowContent } from './SettingsRowContent.js'

export function ItemDropPreview(props: { item: MergedLauncherItem; detail: string }): JSX.Element {
  return (
    <DragPreview class={SETTINGS_CARD_CLASS}>
      <SettingsRowContent scope={props.item.scope} name={props.item.name} detail={props.detail} grip />
    </DragPreview>
  )
}
