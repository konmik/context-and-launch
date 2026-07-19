import { Switch, Match, type JSX } from "solid-js";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

function IconSvg(props: { class: string; children: JSX.Element }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" class={`shrink-0 ${props.class}`}
    >
      {props.children}
    </svg>
  );
}

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
          <IconSvg class="animate-pulse text-primary">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </IconSvg>
        </Match>
        <Match when={props.status === "blocked"}>
          <IconSvg class="text-amber-500">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" x2="12" y1="8" y2="12"/>
            <line x1="12" x2="12.01" y1="16" y2="16"/>
          </IconSvg>
        </Match>
        <Match when={props.status === "idle"}>
          <IconSvg class="text-muted-foreground">
            <circle cx="12" cy="12" r="10"/>
            <line x1="10" x2="10" y1="15" y2="9"/>
            <line x1="14" x2="14" y1="15" y2="9"/>
          </IconSvg>
        </Match>
        <Match when={props.status === "done"}>
          <IconSvg class="text-green-600">
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
          </IconSvg>
        </Match>
        <Match when={props.status === "unknown"}>
          <IconSvg class="text-muted-foreground">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <path d="M12 17h.01"/>
          </IconSvg>
        </Match>
      </Switch>
    </span>
  );
}
