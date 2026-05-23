import { createSignal, createEffect, Show, For, on, onCleanup } from "solid-js";
import type { TicketInfo } from "~/types.js";
import AiConsoleTab from "./AiConsoleTab";
import ResizableWindow from "./ResizableWindow";

function DiscardConfirmation(props: {
  open: boolean;
  message: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
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
  columns: string[];
}

export default function TicketDetailDialog(props: TicketDetailDialogProps) {
  const [activeTab, setActiveTab] = createSignal("");
  const [content, setContent] = createSignal("");
  const [savedContent, setSavedContent] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const [pendingTab, setPendingTab] = createSignal<string | null>(null);
  const [confirmingTabSwitch, setConfirmingTabSwitch] = createSignal(false);

  const hasUnsavedChanges = () => activeTab() !== "ai-console" && content() !== savedContent();

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
      () => [props.open, props.ticket, props.columns] as const,
      ([open, ticket, columns]) => {
        if (open && ticket && columns.length > 0) {
          setActiveTab(columns[0]);
        }
      }
    )
  );

  createEffect(
    on(
      () => [props.open, props.ticket, activeTab()] as const,
      async ([open, ticket, tab]) => {
        if (!open || !ticket || !tab || tab === "ai-console") return;
        setLoading(true);
        setContent("");
        try {
          const res = await fetch(
            `/api/projects/${props.slug}/board/tickets/${ticket.folderName}/stages/${tab}`
          );
          if (res.ok) {
            const data = await res.json();
            setContent(data.content);
            setSavedContent(data.content);
          } else {
            setContent("");
            setSavedContent("");
          }
        } catch {
          setContent("");
          setSavedContent("");
        } finally {
          setLoading(false);
        }
      }
    )
  );

  async function saveStage() {
    const ticket = props.ticket;
    const tab = activeTab();
    if (!ticket || !tab) return;
    setSaving(true);
    try {
      await fetch(
        `/api/projects/${props.slug}/board/tickets/${ticket.folderName}/stages/${tab}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content() }),
        }
      );
      setSavedContent(content());
    } catch {
      // swallow
    } finally {
      setSaving(false);
    }
  }

  function requestTabSwitch(tab: string) {
    if (tab === activeTab()) return;
    if (hasUnsavedChanges()) {
      setPendingTab(tab);
      setConfirmingTabSwitch(true);
      return;
    }
    setActiveTab(tab);
  }

  function confirmTabSwitch() {
    const tab = pendingTab();
    setConfirmingTabSwitch(false);
    setPendingTab(null);
    if (tab) {
      setActiveTab(tab);
    }
  }

  function cancelTabSwitch() {
    setConfirmingTabSwitch(false);
    setPendingTab(null);
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
      if (confirmingTabSwitch()) {
        cancelTabSwitch();
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
            <h2 class="text-lg font-semibold">
              {props.ticket!.number} - {props.ticket!.title}
            </h2>
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
              <Show when={activeTab() !== "ai-console"}>
                <button
                  type="button"
                  onClick={saveStage}
                  disabled={saving() || loading() || !hasUnsavedChanges()}
                  class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {saving() ? "Saving..." : "Save"}
                </button>
              </Show>
            </div>
          }
        >
          <div class="flex h-full flex-col">
            <div class="flex border-b border-border">
              <For each={props.columns}>
                {(col) => (
                  <button
                    class={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab() === col
                        ? "border-b-2 border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => requestTabSwitch(col)}
                  >
                    {col}
                  </button>
                )}
              </For>
              <button
                class={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab() === "ai-console"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => requestTabSwitch("ai-console")}
              >
                AI Console
              </button>
            </div>

            <div class="flex-1 overflow-hidden p-4">
              <Show
                when={activeTab() === "ai-console"}
                fallback={
                  <Show
                    when={!loading()}
                    fallback={
                      <div class="flex h-full items-center justify-center">
                        <div class="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      </div>
                    }
                  >
                    <textarea
                      value={content()}
                      onInput={(e) => setContent(e.currentTarget.value)}
                      class="h-full w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder="Write markdown here..."
                    />
                  </Show>
                }
              >
                <AiConsoleTab slug={props.slug} ticket={props.ticket!} />
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
        open={confirmingTabSwitch()}
        message="You have unsaved changes. Discard them and switch tabs?"
        onCancel={cancelTabSwitch}
        onDiscard={confirmTabSwitch}
      />
    </>
  );
}
