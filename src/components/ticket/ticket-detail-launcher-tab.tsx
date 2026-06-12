import "solid-resizable-panels/styles.css";
import { onCleanup } from "solid-js";
import { PanelGroup, Panel, ResizeHandle } from "solid-resizable-panels";
import AgentLauncher from "../launcher/AgentLauncher";
import MarkdownEditor from "../shared/MarkdownEditor.js";
import { TAB_PANE_CLASS } from "./ticket-detail-parts.js";
import type { AgentLauncherController } from "../launcher/agent-launcher-controller.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/core/launcher/launcher-config.js";

const SPLITTER_STORAGE_KEY = "launcher-splitter-ratio";

function readSavedSizes(): [number, number] {
	try {
		const raw = localStorage.getItem(SPLITTER_STORAGE_KEY);
		if (raw) {
			const arr = JSON.parse(raw);
			if (Array.isArray(arr) && arr.length === 2) return [arr[0], arr[1]];
		}
	} catch (e) { console.warn("Failed to read saved splitter sizes:", e); }
	return [40, 60];
}

export function LauncherTab(props: {
  config: MergedLauncherConfig | null;
  onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
  ctrl: AgentLauncherController;
}) {
  const saved = readSavedSizes();
  const ctrl = props.ctrl;

  let splitterPersistTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(splitterPersistTimer));
  function persistSplitterSizes(sizes: number[]) {
    if (sizes.length === 2) {
      clearTimeout(splitterPersistTimer);
      splitterPersistTimer = setTimeout(() => {
        localStorage.setItem(SPLITTER_STORAGE_KEY, JSON.stringify(sizes));
      }, 300);
    }
  }

  return (
    <div class={TAB_PANE_CLASS}>
      <PanelGroup direction="row" class="h-full" onLayoutChange={persistSplitterSizes}>
        <Panel id="launcher-controls" initialSize={saved[0]} minSize={20}>
          <div class="flex h-full flex-col ">
            <div class="flex-1 overflow-hidden pt-4">
              <AgentLauncher
                config={props.config}
                onDefaultsChange={props.onDefaultsChange}
                ctrl={ctrl}
              />
            </div>
          </div>
        </Panel>
        <ResizeHandle class={[
          "relative w-4 cursor-col-resize !bg-transparent",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-px",
          "after:-translate-x-1/2 after:bg-border/10",
          "hover:after:bg-border/30",
        ].join(" ")} />
        <Panel id="launcher-preview" initialSize={saved[1]} minSize={20}>
          <div class="flex h-full flex-col ">
            <div class="px-4 pt-4">
              <div class="mb-1 flex items-center justify-between">
                <label class="text-sm text-muted-foreground">Initial Prompt</label>
                <label class="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={ctrl.preview.editMode()}
                    onChange={(e) => ctrl.preview.setEditMode(e.currentTarget.checked)}
                    data-testid="prompt-preview-edit-toggle"
                  />
                  Edit
                </label>
              </div>
            </div>
            <div class="flex-1 overflow-hidden px-4">
              <MarkdownEditor
                plain
                value={ctrl.preview.currentPrompt()}
                onChange={(v) => {
                  if (ctrl.preview.editMode()) {
                    ctrl.preview.setEditedPrompt(v);
                  } else if (v !== ctrl.preview.currentPrompt()) {
                    ctrl.preview.setEditMode(true);
                    ctrl.preview.setEditedPrompt(v);
                  }
                }}
              />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
