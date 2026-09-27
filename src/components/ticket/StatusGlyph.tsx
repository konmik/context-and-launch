import type { JSX } from '@solidjs/web'

export function StatusGlyph(props: { glyph: string; color: string; size: number }): JSX.Element {
  return (
    <span
      class="inline-block shrink-0 font-mono leading-none tabular-nums"
      style={{
        'font-size': `${props.size}px`,
        width: `${props.size}px`,
        'text-align': 'center',
        color: props.color,
      }}
    >
      {props.glyph}
    </span>
  )
}
