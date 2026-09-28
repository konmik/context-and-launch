import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import type { ItemType } from './launcher-settings-form-types.js'
import { ItemSectionContent } from './ItemSectionContent.js'

export interface ItemSectionProps {
  open: boolean
  heading: string
  itemType: ItemType
  addButtonTestId: string
  rowTestId: string
  dragHandleTestId: string
  editTestId: string
  deleteTestId: string
  sharedOrderWarning?: string
  sharedOrderWarningTestId?: string
}

export function ItemSection(props: ItemSectionProps): JSX.Element {
  return (
    <ErrorScope active={props.open}>
      <ItemSectionContent {...props} />
    </ErrorScope>
  )
}
