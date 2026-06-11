import { ShortcutsTab, TAB_PANE_CLASS } from "./ticket-detail-parts.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

export function ShortcutsTabPane(props: {
  config: MergedLauncherConfig | null;
  running: string;
  onRun: (name: string) => void;
}) {
  return (
    <div class={TAB_PANE_CLASS}>
      <ShortcutsTab config={props.config} running={props.running} onRun={props.onRun} />
    </div>
  );
}
