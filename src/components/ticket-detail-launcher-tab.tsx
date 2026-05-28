import AgentLauncher from "./AgentLauncher";
import { TAB_PANE_CLASS } from "./ticket-detail-parts.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/server/launcher/launcher-config.js";

export function LauncherTab(props: {
  slug: string;
  ticket: TicketInfo;
  config: MergedLauncherConfig | null;
  onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
  useWorktree: boolean;
}) {
  return (
    <div class={TAB_PANE_CLASS}>
      <AgentLauncher slug={props.slug} ticket={props.ticket} config={props.config} onDefaultsChange={props.onDefaultsChange} useWorktree={props.useWorktree} />
    </div>
  );
}
