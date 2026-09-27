import type { JSX } from '@solidjs/web'

export function TabsList(props: { children: JSX.Element }): JSX.Element {
  return (
    <div role="tablist" data-scope="tabs" data-part="list">
      {props.children}
    </div>
  )
}
