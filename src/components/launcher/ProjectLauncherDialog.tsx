import { createSignal, createEffect, on } from "solid-js";
import { X } from "lucide-solid";
import {
  FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
  FloatingPanelCloseTrigger, FloatingPanelTitle,
  FLOATING_WINDOW_MIN_SIZE, tallWindowDefaultSize,
} from "../ui/floating-panel";
import { LauncherTab } from "../ticket/ticket-detail-launcher-tab.js";
import { createAgentLauncherController } from "./agent-launcher-controller.js";
import {
  getMergedLauncherConfig, saveColumnDefaults, launchProjectAgentAction,
  type MergedLauncherConfigWithMeta,
} from "./launcher-api.js";
import { PROJECT_LAUNCH_KEY } from "~/core/launcher/launch-keys.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import type { LauncherColumnDefaults } from "~/core/launcher/launcher-config.js";
import ErrorDialog from "../shared/ErrorDialog.js";

export default function ProjectLauncherDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
}) {
  const [config, setConfig] = createSignal<MergedLauncherConfigWithMeta | null>(null);
  const [error, setError] = createSignal<ErrorInfo | null>(null);

  createEffect(on(
    () => [props.open, props.projectSlug] as const,
    async ([open, projectSlug]) => {
      if (!open || !projectSlug) return;
      try {
        setConfig(await getMergedLauncherConfig(projectSlug));
      } catch (e) {
        setError(errorPayload(e, "Load failed"));
      }
    },
  ));

  function patchDefaults(patch: Partial<LauncherColumnDefaults>) {
    saveColumnDefaults(props.projectSlug, PROJECT_LAUNCH_KEY, patch)
      .then((result) => {
        if (!result.ok) setError({ title: "Save failed", description: result.message });
      })
      .catch((e) => setError(errorPayload(e, "Save failed")));
  }

  const ctrl = createAgentLauncherController({
    projectSlug: props.projectSlug,
    get config() { return config(); },
    onDefaultsChange: patchDefaults,
    useWorktree: false,
    get projectPath() { return config()?.projectPath ?? ""; },
    worktreeDir: "",
    launchDir: () => config()?.projectPath ?? "",
    launch: (args) => launchProjectAgentAction(props.projectSlug, args),
  });

  async function run() {
    await ctrl.launchAgent();
    if (!ctrl.errorInfo()) props.onOpenChange(false);
  }

  return (
    <>
      <FloatingWindow
        open={props.open}
        onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
        defaultSize={tallWindowDefaultSize()}
        minSize={FLOATING_WINDOW_MIN_SIZE}
        persistRect
      >
        <FloatingWindowHeader
          title={<FloatingPanelTitle>Launch an agent</FloatingPanelTitle>}
          actions={
            <FloatingPanelCloseTrigger aria-label="Close">
              <X size={16} />
            </FloatingPanelCloseTrigger>
          }
        />
        <FloatingPanelBody>
          <LauncherTab
            config={config()}
            onDefaultsChange={patchDefaults}
            ctrl={ctrl}
          />
          <div class="flex items-end gap-2 border-t border-border px-4 py-3">
            <div class="min-w-0 flex-1" data-testid="project-launcher-dir-display">
              <span class="block text-xs text-muted-foreground">Launch directory</span>
              <span
                class="block truncate text-xs text-muted-foreground"
                dir="rtl"
                style={{ "text-align": "left" }}
              >{config()?.projectPath ?? ""}</span>
            </div>
            <button
              type="button"
              onClick={run}
              disabled={ctrl.launching()}
              class="btn-primary"
              data-testid="project-launcher-run-button"
            >Run</button>
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              class="btn-secondary"
              data-testid="project-launcher-close-button"
            >Close</button>
          </div>
        </FloatingPanelBody>
      </FloatingWindow>

      <ErrorDialog error={error()} onClose={() => setError(null)} />
    </>
  );
}
