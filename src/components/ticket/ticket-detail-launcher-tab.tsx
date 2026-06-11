import AgentLauncher from "../launcher/AgentLauncher";
import { TAB_PANE_CLASS } from "./ticket-detail-parts.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/core/launcher/launcher-config.js";

export function LauncherTab(props: {
  projectSlug: string;
  ticket: TicketInfo;
  config: MergedLauncherConfig | null;
  onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
  useWorktree: boolean;
}) {
  return (
    <div class={TAB_PANE_CLASS}>
      <AgentLauncher
        projectSlug={props.projectSlug}
        ticket={props.ticket}
        config={props.config}
        onDefaultsChange={props.onDefaultsChange}
        useWorktree={props.useWorktree}
      />
    </div>
  );
}
