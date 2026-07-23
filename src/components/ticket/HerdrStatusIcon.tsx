import { Switch, Match } from "solid-js";
import Activity from "lucide-solid/icons/activity";
import CircleAlert from "lucide-solid/icons/circle-alert";
import CirclePause from "lucide-solid/icons/circle-pause";
import CircleDot from "lucide-solid/icons/circle-dot";
import CircleHelp from "lucide-solid/icons/circle-question-mark";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

export default function HerdrStatusIcon(props: { status: HerdrAgentStatus }) {
  return (
    <span
      class="inline-flex items-center"
      data-testid="herdr-status-icon"
      data-herdr-status={props.status}
      title={props.status}
    >
      <Switch>
        <Match when={props.status === "working"}>
          <Activity size={12} class="shrink-0 animate-pulse text-primary" />
        </Match>
        <Match when={props.status === "blocked"}>
          <CircleAlert size={12} class="shrink-0 text-warning" />
        </Match>
        <Match when={props.status === "idle"}>
          <CirclePause size={12} class="shrink-0 text-muted-foreground" />
        </Match>
        <Match when={props.status === "done"}>
          <CircleDot size={12} class="shrink-0 text-muted-foreground" />
        </Match>
        <Match when={props.status === "unknown"}>
          <CircleHelp size={12} class="shrink-0 text-muted-foreground" />
        </Match>
      </Switch>
    </span>
  );
}
