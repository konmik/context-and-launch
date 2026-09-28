import type { JSX } from '@solidjs/web'
import type { HerdrAgentStatus } from '~/core/herdr/herdr-client.js'
import { StatusGlyph } from './StatusGlyph.js'

const HERDR_STATUS_COLORS = {
  working: '#f9e2af',
  blocked: '#f38ba8',
  idle: '#a6e3a1',
  done: '#94e2d5',
  unknown: '#6c7086',
}

const HERDR_STATUS_GLYPHS = {
  working: '●',
  blocked: '●',
  idle: '○',
  done: '●',
  unknown: '·',
}

export default function HerdrStatusIcon(props: { status: HerdrAgentStatus; size?: number }): JSX.Element {
  const size = () => props.size ?? 12
  const color = () => HERDR_STATUS_COLORS[props.status]
  return (
    <span class="inline-flex items-center" data-testid="herdr-status-icon" data-herdr-status={props.status} title={props.status}>
      <StatusGlyph glyph={HERDR_STATUS_GLYPHS[props.status]} color={color()} size={size()} />
    </span>
  )
}
