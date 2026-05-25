import { createSignal, createEffect, Show, For, on, onCleanup } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/types.js";
import AgentLauncher from "./AgentLauncher";
import ResizableWindow from "./ResizableWindow";
import MarkdownEditor from "./MarkdownEditor";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

function DiscardConfirmation(props: {
  open: boolean;
  message: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  useModEnterSubmit({
    onSubmit: () => props.onDiscard(),
    disabled: () => false,
    active: () => props.open,
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => e.preventDefault()}>
        <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-semibold">Unsaved Changes</h2>
          <p class="mb-4 text-sm text-muted-foreground">{props.message}</p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={props.onCancel}
              class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onDiscard}
              title={modEnterHint()}
              class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

interface TicketDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  ticket: TicketInfo | null;
}

export default function TicketDetailDialog(props: TicketDetailDialogProps) {
  const [activeFile, setActiveFile] = createSignal("");
  const [content, setContent] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const [pendingFile, setPendingFile] = createSignal<string | null>(null);
  const [confirmingFileSwitch, setConfirmingFileSwitch] = createSignal(false);
  const [pendingAiSwitch, setPendingAiSwitch] = createSignal(false);
  const [showAiConsole, setShowAiConsole] = createSignal(false);
  const [extraFiles, setExtraFiles] = createSignal<string[]>([]);
  const [newFileDialogOpen, setNewFileDialogOpen] = createSignal(false);
  const [newFileName, setNewFileName] = createSignal("");
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [error, setError] = createSignal("");
  const [dropdownOpen, setDropdownOpen] = createSignal(false);

  useModEnterSubmit({
    onSubmit: submitNewFile,
    disabled: () => !newFileName().trim(),
    active: () => newFileDialogOpen(),
  });

  useModEnterSubmit({
    onSubmit: deleteFile,
    disabled: () => false,
    active: () => confirmingDelete(),
  });

  const hasOverlay = () =>
    showAiConsole() || newFileDialogOpen() || confirmingClose() || confirmingFileSwitch() || confirmingDelete();

  const fileOptions = () => {
    const defaults = ["to-do", "product-requirement-document"];
    const existing = props.ticket?.stageNames ?? [];
    const extra = extraFiles();
    const all = [...defaults];
    for (const name of [...existing, ...extra]) {
      if (!all.includes(name)) {
        all.push(name);
      }
    }
    return all;
  };

  const hasUnsavedChanges = () => !showAiConsole() && content() !== savedContent();

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasUnsavedChanges()) {
      e.preventDefault();
    }
  }

  createEffect(() => {
    if (props.open && typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleBeforeUnload);
    } else if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  });

  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  });

  createEffect(
    on(
      () => [props.open, props.ticket] as const,
      ([open, ticket]) => {
        if (open && ticket) {
          setShowAiConsole(false);
          setExtraFiles([]);
          setActiveFile("to-do");
        }
      }
    )
  );

  createEffect(
    on(
      () => [props.open, props.ticket, activeFile()] as const,
      async ([open, ticket, file]) => {
        if (!open || !ticket || !file || showAiConsole()) return;
        setError("");
        try {
          const res = await fetch(
            `/api/projects/${props.slug}/board/tickets/${ticket.folderName}/stages/${file}`
          );
          if (res.ok) {
            const data = await res.json();
            setContent(data.content);
            setSavedContent(data.content);
          } else {
            setContent("");
            setSavedContent("");
          }
        } catch (e) {
          setContent("");
          setSavedContent("");
          setError(e instanceof Error ? e.message : "Failed to load file");
        }
      }
    )
  );

  async function saveFile() {
    const ticket = props.ticket;
    const file = activeFile();
    if (!ticket || !file) return;
    setSaving(true);
    try {
      await fetch(
        `/api/projects/${props.slug}/board/tickets/${ticket.folderName}/stages/${file}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content() }),
        }
      );
      setSavedContent(content());
      revalidate("board-data");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }

  function requestFileSwitch(file: string) {
    if (file === activeFile() && !showAiConsole()) return;
    if (hasUnsavedChanges()) {
      setPendingFile(file);
      setConfirmingFileSwitch(true);
      return;
    }
    setShowAiConsole(false);
    if (file !== activeFile()) {
      setActiveFile(file);
    }
  }

  function toggleAiConsole() {
    if (showAiConsole()) {
      setShowAiConsole(false);
      return;
    }
    if (hasUnsavedChanges()) {
      setPendingFile(null);
      setPendingAiSwitch(true);
      setConfirmingFileSwitch(true);
      return;
    }
    setShowAiConsole(true);
  }

  function proceedFileSwitch() {
    const file = pendingFile();
    const toAi = pendingAiSwitch();
    setConfirmingFileSwitch(false);
    setPendingFile(null);
    setPendingAiSwitch(false);
    if (toAi) {
      setShowAiConsole(true);
    } else if (file) {
      setShowAiConsole(false);
      setActiveFile(file);
    }
  }

  function cancelFileSwitch() {
    setConfirmingFileSwitch(false);
    setPendingFile(null);
  }

  function selectFile(name: string) {
    setDropdownOpen(false);
    requestFileSwitch(name);
  }

  function openNewFileDialog() {
    setDropdownOpen(false);
    setNewFileName("");
    setNewFileDialogOpen(true);
  }

  function submitNewFile() {
    const raw = newFileName().trim();
    if (!raw) return;
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) return;
    setNewFileDialogOpen(false);
    if (!fileOptions().includes(slug)) {
      setExtraFiles((prev) => [...prev, slug]);
    }
    requestFileSwitch(slug);
  }

  async function deleteFile() {
    const ticket = props.ticket;
    const file = activeFile();
    if (!ticket || !file) return;
    setConfirmingDelete(false);
    try {
      await fetch(
        `/api/projects/${props.slug}/board/tickets/${ticket.folderName}/stages/${file}`,
        { method: "DELETE" }
      );
      revalidate("board-data");
      const remaining = fileOptions().filter((f) => f !== file);
      setActiveFile(remaining[0] ?? "to-do");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete file");
    }
  }

  function close() {
    if (hasUnsavedChanges()) {
      setConfirmingClose(true);
      return;
    }
    props.onOpenChange(false);
  }

  function forceClose() {
    setConfirmingClose(false);
    props.onOpenChange(false);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (dropdownOpen()) {
        setDropdownOpen(false);
        e.preventDefault();
      } else if (confirmingFileSwitch()) {
        cancelFileSwitch();
        e.preventDefault();
      } else if (confirmingClose()) {
        setConfirmingClose(false);
        e.preventDefault();
      }
    }
  }

  return (
    <>
      <Show when={props.ticket}>
        <ResizableWindow
          open={props.open}
          onClose={close}
          onKeyDown={handleKeyDown}
          storageKey="ticket-dialog-size"
          title={
            <div class="flex items-end justify-between">
              <h2 class="text-lg font-semibold">
                {props.ticket!.number} - {props.ticket!.title}
              </h2>
              <button
                type="button"
                onClick={toggleAiConsole}
                onMouseDown={(e) => e.stopPropagation()}
                class={`inline-flex h-10 shrink-0 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  showAiConsole()
                    ? "bg-primary text-primary-foreground"
                    : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {showAiConsole() ? "File Editor ›" : "Agent Launcher ›"}
              </button>
            </div>
          }
          footer={
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}

                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Close
              </button>
              <Show when={!showAiConsole()}>
                <button
                  type="button"
                  onClick={saveFile}
  
                  disabled={saving() || !hasUnsavedChanges()}
                  class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  Save
                </button>
              </Show>
            </div>
          }
        >
          <div class="flex h-full flex-col">
            <Show when={!showAiConsole()}>
              <div class="flex items-center gap-2 px-4 py-2">
                <div class="relative min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen())}
                    class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <span class="truncate">{activeFile()}.md</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2 shrink-0"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                  <Show when={dropdownOpen()}>
                    <div class="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div class="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md">
                      <For each={fileOptions()}>
                        {(name) => (
                          <button
                            type="button"
                            onClick={() => selectFile(name)}
                            class={`w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                              name === activeFile() ? "font-semibold" : ""
                            }`}
                          >
                            {name}.md
                          </button>
                        )}
                      </For>
                      <div class="my-1 border-t border-border" />
                      <button
                        type="button"
                        onClick={openNewFileDialog}
                        class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        New markdown file...
                      </button>
                    </div>
                  </Show>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-2 text-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                  title="Delete file"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </Show>

            <Show when={error()}>
              <div class="mx-4 mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error()}
              </div>
            </Show>

            <div class="flex-1 overflow-hidden px-4 pb-2">
              <Show when={!showAiConsole()} fallback={
                <AgentLauncher slug={props.slug} ticket={props.ticket!} />
              }>
                <MarkdownEditor
                  value={content()}
                  onChange={setContent}
                  onSave={saveFile}
                  placeholder="Write markdown here..."
                />
              </Show>
            </div>
          </div>
        </ResizableWindow>
      </Show>

      <DiscardConfirmation
        open={confirmingClose()}
        message="You have unsaved changes. Discard them?"
        onCancel={() => setConfirmingClose(false)}
        onDiscard={forceClose}
      />

      <DiscardConfirmation
        open={confirmingFileSwitch()}
        message="You have unsaved changes. Discard them and switch files?"
        onCancel={cancelFileSwitch}
        onDiscard={proceedFileSwitch}
      />

      <Show when={newFileDialogOpen()}>
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
          <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 class="mb-4 text-lg font-semibold">New Markdown File</h2>
            <label class="mb-1 block text-sm text-muted-foreground">
              File name (without .md extension)
            </label>
            <input
              type="text"
              value={newFileName()}
              onInput={(e) => setNewFileName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewFile();
                if (e.key === "Escape") setNewFileDialogOpen(false);
              }}
              autofocus
              class="mb-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. design-notes"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFileDialogOpen(false)}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitNewFile}
                disabled={!newFileName().trim()}
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={confirmingDelete()}>
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(e) => e.preventDefault()}>
          <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 class="mb-4 text-lg font-semibold">Delete File</h2>
            <p class="mb-4 text-sm text-muted-foreground">
              Delete {activeFile()}.md? This cannot be undone.
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteFile}
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
