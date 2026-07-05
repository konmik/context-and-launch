import { Show } from "solid-js";
import {
  FloatingPanelRoot, FloatingPanelHeader, FloatingPanelBody,
  FloatingPanelDragTrigger, FloatingPanelResizeTrigger,
  FloatingPanelTitle,
} from "../ui/floating-panel";
import { TabsRoot, TabsList, TabsTrigger } from "../ui/tabs";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  DiscardConfirmation,
  NewFileDialog,
  DeleteFileDialog,
  ConfirmUploadDialog,
  DirtyWorktreeShortcutDialog,
  activeFileLabel,
} from "./ticket-detail-parts.js";
import { EditorTab } from "./ticket-detail-editor-tab.js";
import { LauncherTab } from "./ticket-detail-launcher-tab.js";
import { createAgentLauncherController } from "../launcher/agent-launcher-controller.js";
import { ShortcutsTabPane } from "./ticket-detail-shortcuts-tab.js";
import { createTicketDetailState, type Tab, type TicketDetailState } from "./ticket-detail-state.js";
import ErrorDialog from "../shared/ErrorDialog.js";

interface TicketDetailDialogProps {
  onClose: () => void;
  projectSlug: string;
  ticket: TicketInfo | null;
}

export default function TicketDetailDialog(props: TicketDetailDialogProps) {
  return (
    <Show when={props.ticket} keyed>
      {(ticket) => (
        <TicketDetailContent
          ticket={ticket}
          onClose={props.onClose}
          projectSlug={props.projectSlug}
        />
      )}
    </Show>
  );
}

function TicketDetailContent(props: {
  ticket: TicketInfo;
  onClose: () => void;
  projectSlug: string;
  ctrl?: TicketDetailState;
}) {
  const s = props.ctrl ?? createTicketDetailState(props);

  const launcherDeps = {
    projectSlug: props.projectSlug,
    ticket: () => ({
      ...props.ticket,
      folderName: s.savedFolderName(),
      number: s.savedNumber(),
      title: s.savedTitle(),
    }),
    get config() { return s.launcherConfig(); },
    onDefaultsChange: s.patchColumnDefaults,
    get useWorktree() { return s.useWorktree(); },
    get projectPath() { return s.launcherConfig()?.projectPath ?? ""; },
    get worktreeDir() { return s.launcherConfig()?.worktreeDir ?? ""; },
    launchDir: s.launchDir,
  };
  const launcherCtrl = createAgentLauncherController(launcherDeps);

  useModEnterSubmit({
    onSubmit: s.submitNewFile,
    disabled: () => !s.newFileName().trim(),
    active: () => s.newFileDialogOpen(),
  });

  useModEnterSubmit({
    onSubmit: s.deleteOrRemoveFile,
    disabled: () => false,
    active: () => s.confirmingDelete(),
  });

  useModEnterSubmit({
    onSubmit: s.saveAll,
    disabled: () => s.saving() || !s.hasAnyUnsavedChanges(),
    active: () =>
      !s.newFileDialogOpen() &&
      !s.confirmingDelete() &&
      !s.confirmingFileSwitch() &&
      !s.confirmingClose(),
  });

  return (
    <>
      <Show when={s.initialTabResolved()}>
      <FloatingPanelRoot
        open={true}
        onOpenChange={(d) => { if (!d.open) s.close(); }}
        defaultSize={{ width: 768, height: Math.floor(window.innerHeight * 0.8) }}
        minSize={{ width: 400, height: 300 }}
        persistRect
      >
        <FloatingPanelHeader>
          <FloatingPanelDragTrigger class="flex flex-col gap-3">
            <div class="flex items-start justify-between gap-4">
              <div class="flex min-w-0 flex-1 items-center gap-1.5 text-lg font-semibold">
                <input
                  type="text"
                  data-no-drag
                  data-testid="ticket-detail-number-input"
                  value={s.editedNumber()}
                  onInput={(e) => s.setEditedNumber(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { s.setEditedNumber(s.savedNumber()); e.currentTarget.blur(); }
                  }}
                  class="shrink-0 bg-transparent outline-none focus:border-b focus:border-accent-foreground"
                  style={{ "field-sizing": "content" }}
                />
                <span class="shrink-0">-</span>
                <input
                  type="text"
                  data-no-drag
                  data-testid="ticket-detail-title-input"
                  value={s.editedTitle()}
                  onInput={(e) => s.setEditedTitle(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { s.setEditedTitle(s.savedTitle()); e.currentTarget.blur(); }
                  }}
                  class="min-w-0 flex-1 bg-transparent outline-none focus:border-b focus:border-accent-foreground"
                />
              </div>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  data-no-drag
                  data-testid="ticket-detail-close-window-button"
                  aria-label="Close Window"
                  onClick={() => s.close()}
                  class={
                    "inline-flex h-8 w-8 items-center justify-center rounded-md "
                    + "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                  </svg>
                </button>
              </div>
            </div>
            <div data-no-drag class="-mx-4 -mb-4">
              <TabsRoot value={s.activeTab()} onValueChange={(d) => s.switchTab(d.value as Tab)}>
                <TabsList>
                  <TabsTrigger value="editor" data-testid="ticket-detail-tab-editor">File Editor</TabsTrigger>
                  <TabsTrigger value="launcher" data-testid="ticket-detail-tab-launcher">Agent Launcher</TabsTrigger>
                  <TabsTrigger value="shortcuts" data-testid="ticket-detail-tab-shortcuts">Shortcuts</TabsTrigger>
                </TabsList>
              </TabsRoot>
            </div>
          </FloatingPanelDragTrigger>
        </FloatingPanelHeader>

        <FloatingPanelBody>
        <div class="flex h-full flex-col">
          <Show when={s.activeTab() === "editor"}>
            <EditorTab ctrl={s} />
          </Show>
          <Show when={s.activeTab() === "launcher"}>
            <LauncherTab
              config={launcherDeps.config}
              onDefaultsChange={launcherDeps.onDefaultsChange}
              ctrl={launcherCtrl}
            />
          </Show>
          <Show when={s.activeTab() === "shortcuts"}>
            <ShortcutsTabPane
              config={s.launcherConfig()}
              running={s.runningShortcut()}
              onRun={s.runShortcut}
            />
          </Show>

          <div class="border-t border-border px-4 py-3">
            <div class="flex items-end gap-2">
              <div
                class="min-w-0 flex-1"
                data-testid="launch-dir-display"
              >
                <div class="flex items-center gap-1">
                  <span class="shrink-0 text-xs text-muted-foreground">
                    Launch directory
                  </span>
                  <button
                    type="button"
                    class="btn-icon shrink-0 !h-6 !w-6"
                    data-testid="launch-dir-copy-button"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(
                          s.launchDir(),
                        ).catch((err) => {
                          console.warn(
                            "Failed to copy launch dir:",
                            err,
                          );
                        });
                      } catch (err) {
                        console.warn(
                          "Clipboard API unavailable:",
                          err,
                        );
                      }
                    }}
                    title="Copy path"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12" height="12"
                      viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect
                        width="14" height="14"
                        x="8" y="8" rx="2" ry="2"
                      />
                      <path d={
                        "M4 16c-1.1 0-2-.9-2-2V4"
                        + "c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
                      }/>
                    </svg>
                  </button>
                  <div class="flex-1" />
                  <label class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={s.useWorktree()}
                      onChange={(e) => s.persistWorktree(e.currentTarget.checked)}
                      class="rounded border-input"
                      data-testid="ticket-detail-use-worktree-checkbox"
                    />
                    Launch in worktree
                  </label>
                </div>
                <span
                  class="block truncate text-xs text-muted-foreground"
                  dir="rtl"
                  style={{ "text-align": "left" }}
                >{s.launchDir()}</span>
              </div>
              <div class="w-8 shrink-0" />
              <Show when={s.activeTab() === "launcher"}>
                <button
                  type="button"
                  onClick={() => launcherCtrl.launchAgent()}
                  disabled={launcherCtrl.launching()}
                  class="btn-primary"
                  data-testid="ticket-detail-launcher-run-button"
                >Run</button>
              </Show>
              <Show when={s.showSaveButton() || s.hasUnsavedHeaderChanges()}>
                <button
                  type="button"
                  onClick={s.saveAll}
                  disabled={s.saving() || !s.hasAnyUnsavedChanges()}
                  title={modEnterHint()}
                  class="btn-primary"
                  data-testid="ticket-detail-save-button"
                >Save</button>
              </Show>
              <button
                type="button"
                onClick={s.close}
                class="btn-secondary"
                data-testid="ticket-detail-close-button"
              >Close</button>
            </div>
          </div>
        </div>
        </FloatingPanelBody>

        <FloatingPanelResizeTrigger axis="s" />
        <FloatingPanelResizeTrigger axis="w" />
        <FloatingPanelResizeTrigger axis="e" />
        <FloatingPanelResizeTrigger axis="n" />
        <FloatingPanelResizeTrigger axis="ne" />
        <FloatingPanelResizeTrigger axis="nw" />
        <FloatingPanelResizeTrigger axis="sw" />
        <FloatingPanelResizeTrigger axis="se">
          <svg
            xmlns="http://www.w3.org/2000/svg" width="12" height="12"
            viewBox="0 0 12 12"
          >
            <path
              d="M10 2v8H2" fill="none" stroke="currentColor"
              stroke-width="1.5" stroke-linecap="round"
            />
          </svg>
        </FloatingPanelResizeTrigger>
      </FloatingPanelRoot>

      <DiscardConfirmation
        open={s.confirmingClose()}
        message="You have unsaved changes. Discard them?"
        onCancel={() => s.setConfirmingClose(false)}
        onDiscard={s.forceClose}
      />

      <DiscardConfirmation
        open={s.confirmingFileSwitch()}
        message="You have unsaved changes. Discard them and switch files?"
        onCancel={s.cancelFileSwitch}
        onDiscard={s.proceedFileSwitch}
      />

      <DirtyWorktreeShortcutDialog
        info={s.dirtyWorktreeShortcut()}
        running={s.runningShortcut() !== ""}
        onCancel={() => s.setDirtyWorktreeShortcut(null)}
        onRunAnyway={(n) => { s.setDirtyWorktreeShortcut(null); s.runShortcut(n, true); }}
      />

      <NewFileDialog
        open={s.newFileDialogOpen()}
        name={s.newFileName()}
        setName={s.setNewFileName}
        onSubmit={s.submitNewFile}
        onClose={() => s.setNewFileDialogOpen(false)}
      />

      <DeleteFileDialog
        open={s.confirmingDelete()}
        label={activeFileLabel(s.activeFile())}
        onDelete={s.deleteOrRemoveFile}
        onClose={() => s.setConfirmingDelete(false)}
      />

      <ConfirmUploadDialog
        open={!!s.confirmOverwrite()}
        title="Overwrite File"
        description={`A file named "${s.confirmOverwrite()?.fileName}" already exists. Overwrite it?`}
        confirmLabel="Overwrite"
        confirmClass="btn-destructive"
        onCancel={s.cancelOverwriteConfirm}
        onConfirm={s.confirmOverwriteAndUpload}
      />

      <ConfirmUploadDialog
        open={!!s.confirmSize()}
        title="Large File"
        description={
          `"${s.confirmSize()?.fileName}" is `
          + `${((s.confirmSize()?.size ?? 0) / 1024).toFixed(1)} KB, `
          + "which is larger than 10 KB. Copy it anyway?"
        }
        confirmLabel="Copy Anyway"
        confirmClass="btn-primary"
        onCancel={s.cancelSizeConfirm}
        onConfirm={s.confirmSizeAndUpload}
      />

      <ErrorDialog error={s.error()} onClose={() => s.setError(null)} />

      </Show>

    </>
  );
}
