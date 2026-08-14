import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

export const HERDR_STATUS_COLORS: Record<HerdrAgentStatus, string> = {
  working: "#f9e2af",
  blocked: "#f38ba8",
  idle: "#a6e3a1",
  done: "#94e2d5",
  unknown: "#6c7086",
};

const HERDR_STATUS_GLYPHS: Record<HerdrAgentStatus, string> = {
  working: "●",
  blocked: "●",
  idle: "○",
  done: "●",
  unknown: "·",
};

function StatusGlyph(props: { glyph: string; color: string; size: number }) {
  return (
    <span
      class="inline-block shrink-0 font-mono leading-none tabular-nums"
      style={{
        "font-size": `${props.size}px`,
        width: `${props.size}px`,
        "text-align": "center",
        color: props.color,
      }}
    >
      {props.glyph}
    </span>
  );
}

export default function HerdrStatusIcon(props: { status: HerdrAgentStatus; size?: number }) {
  const size = () => props.size ?? 12;
  const color = () => HERDR_STATUS_COLORS[props.status];
  return (
    <span
      class="inline-flex items-center"
      data-testid="herdr-status-icon"
      data-herdr-status={props.status}
      title={props.status}
    >
      <StatusGlyph glyph={HERDR_STATUS_GLYPHS[props.status]} color={color()} size={size()} />
    </span>
  );
}
