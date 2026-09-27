import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import { ColumnsTabContent } from './ColumnsTabContent.js'

export function ColumnsTab(props: { open: boolean; projectSlug: string }): JSX.Element {
  return <ErrorScope active={props.open}><ColumnsTabContent {...props} /></ErrorScope>
}
