import type { JSX } from '@solidjs/web'

export function ScopeBadge(props: { scope: string }): JSX.Element {
  const cls = () => (props.scope === 'app' ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary')
  return <span class={`label-mono rounded px-1.5 py-0.5 text-xs ${cls()}`}>{props.scope === 'app' ? 'User' : 'Project'}</span>
}
