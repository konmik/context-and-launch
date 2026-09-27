import { omit } from 'solid-js'
import type { JSX } from '@solidjs/web'

export const SETTINGS_CARD_CLASS = 'settings-card flex items-center justify-between gap-2 rounded-md border border-border p-3'

export function SettingsCard(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const rest = omit(props, 'class', 'children')
  return (
    <div class={`${SETTINGS_CARD_CLASS} ${props.class ?? ''}`} {...rest}>
      {props.children}
    </div>
  )
}
