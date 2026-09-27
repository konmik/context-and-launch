import type { JSX } from '@solidjs/web'

export function DialogFooter(props: { children: JSX.Element }): JSX.Element {
  return <div class="flex justify-end gap-2 border-t border-border px-6 py-3">{props.children}</div>
}
