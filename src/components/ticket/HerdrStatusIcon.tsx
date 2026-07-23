import { Switch, Match, createSignal, onCleanup } from "solid-js";
import CircleAlert from "lucide-solid/icons/circle-alert";
import CirclePause from "lucide-solid/icons/circle-pause";
import CircleDot from "lucide-solid/icons/circle-dot";
import CircleHelp from "lucide-solid/icons/circle-question-mark";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

export const HERDR_STATUS_COLORS: Record<HerdrAgentStatus, string> = {
  working: "#f9e2af",
  blocked: "#f38ba8",
  idle: "#a6e3a1",
  done: "#94e2d5",
  unknown: "#6c7086",
};

const CLASSIC_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function ClassicSpinner(props: { color: string }) {
  const [frame, setFrame] = createSignal(0);
  const timer = setInterval(() => setFrame((f) => (f + 1) % CLASSIC_FRAMES.length), 80);
  onCleanup(() => clearInterval(timer));
  return (
    <span
      data-testid="herdr-classic-spinner"
      class="inline-block shrink-0 font-mono leading-none tabular-nums"
      style={{ "font-size": "12px", width: "12px", "text-align": "center", color: props.color }}
    >
      {CLASSIC_FRAMES[frame()]}
    </span>
  );
}

export default function HerdrStatusIcon(props: { status: HerdrAgentStatus }) {
  const color = () => HERDR_STATUS_COLORS[props.status];
  return (
    <span
      class="inline-flex items-center"
      data-testid="herdr-status-icon"
      data-herdr-status={props.status}
      title={props.status}
    >
      <Switch>
        <Match when={props.status === "working"}>
          <ClassicSpinner color={color()} />
        </Match>
        <Match when={props.status === "blocked"}>
          <CircleAlert size={12} class="shrink-0" style={{ color: color() }} />
        </Match>
        <Match when={props.status === "idle"}>
          <CirclePause size={12} class="shrink-0" style={{ color: color() }} />
        </Match>
        <Match when={props.status === "done"}>
          <CircleDot size={12} class="shrink-0" style={{ color: color() }} />
        </Match>
        <Match when={props.status === "unknown"}>
          <CircleHelp size={12} class="shrink-0" style={{ color: color() }} />
        </Match>
      </Switch>
    </span>
  );
}
