import { Show, For, createEffect } from "solid-js";
import X from "lucide-solid/icons/x";
import {
  FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
  FloatingPanelCloseTrigger, FloatingPanelTitle,
} from "../ui/floating-panel";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import type { CleanupItemKey } from "~/core/worktree/ticket-cleanup-checks.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import { getCleanupStatus } from "~/components/ticket/ticket-api.js";
import type { TicketCleanupOptions } from "./ticket-cleanup-pure.js";
import {
  createTicketCleanupController,
  type TicketCleanupController,
} from "./ticket-cleanup-controller.js";

interface TicketCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  ticket: TicketInfo | null;
  action: "archive" | "delete";
  onCleanup: (
    folderName: string, cleanup: TicketCleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  onSubmit: (folderName: string) => Promise<{ error?: string | ErrorInfo }>;
  ctrl?: TicketCleanupController;
}

const rows: {
  key: CleanupItemKey; label: string; buttonTestId: string; statusTestId: string;
}[] = [
  { key: "stopHerdrAgent", label: "Stop the Herdr agent",
    buttonTestId: "ticket-cleanup-stop-herdr-button",
    statusTestId: "ticket-cleanup-stop-herdr-status" },
  { key: "deleteWorktree", label: "Delete worktree",
    buttonTestId: "ticket-cleanup-delete-worktree-button",
    statusTestId: "ticket-cleanup-delete-worktree-status" },
  { key: "deleteLocalBranch", label: "Delete local branch",
    buttonTestId: "ticket-cleanup-delete-local-button",
    statusTestId: "ticket-cleanup-delete-local-status" },
  { key: "deleteRemoteBranch", label: "Delete remote branch",
    buttonTestId: "ticket-cleanup-delete-remote-button",
    statusTestId: "ticket-cleanup-delete-remote-status" },
];

export default function TicketCleanupDialog(props: TicketCleanupDialogProps) {
  const s = props.ctrl ?? createTicketCleanupController({
    projectSlug: () => props.projectSlug,
    ticket: () => props.ticket,
    action: () => props.action,
    loadStatus: getCleanupStatus,
    onCleanup: props.onCleanup,
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
  });

  createEffect(() => {
    if (props.open && props.ticket) void s.startChecks();
  });

  useModEnterSubmit({
    onSubmit: () => void s.doSubmit(),
    disabled: s.busy,
    active: () => props.open && !!props.ticket,
  });

  return (
    <FloatingWindow
      open={props.open && !!props.ticket}
      onOpenChange={(d) => { if (!d.open) s.close(); }}
      defaultSize={{ width: 480, height: 460 }}
      minSize={{ width: 380, height: 300 }}
      persistRect
    >
      <FloatingWindowHeader
        title={<FloatingPanelTitle>{s.actionLabel()} Ticket</FloatingPanelTitle>}
        actions={
          <FloatingPanelCloseTrigger aria-label="Close">
            <X size={16} />
          </FloatingPanelCloseTrigger>
        }
      />
      <FloatingPanelBody>
        <div class="flex-1 overflow-auto px-6 py-4">
          <p class="mb-4 text-sm text-muted-foreground">
            {props.ticket?.number} - {props.ticket?.title}
          </p>

          <div class="mb-4 space-y-2">
            <p class="text-sm font-medium">Cleanup</p>
            <div class="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-2 text-sm">
              <For each={rows}>
                {(row) => {
                  const item = () => s.items()[row.key];
                  const running = () => s.runningItem() === row.key;
                  return (
                    <>
                      <button
                        type="button"
                        disabled={item().state !== "ready" || s.busy()}
                        onClick={() => void s.runCleanup(row.key)}
                        class="btn-secondary justify-start whitespace-nowrap"
                        data-testid={row.buttonTestId}
                      >
                        {row.label}
                      </button>
                      <span
                        class="min-w-0 whitespace-pre-line break-words text-left text-xs"
                        data-testid={row.statusTestId}
                        data-state={running() ? "running" : item().state}
                        aria-live="polite"
                      >
                        <Show when={running()} fallback={
                          <>
                            <Show when={item().state === "checking"}>
                              <span class="animate-pulse text-muted-foreground">Checking...</span>
                            </Show>
                            <Show when={item().state === "blocked"}>
                              <span class={"warning" in item() ? "text-destructive" : "text-muted-foreground"}>
                                {(item() as { reason: string }).reason}
                              </span>
                            </Show>
                            <Show when={item().state === "error"}>
                              <span class="text-destructive">
                                {(item() as { error: ErrorInfo }).error.description}
                              </span>
                            </Show>
                          </>
                        }>
                          <span class="animate-pulse text-muted-foreground">Working...</span>
                        </Show>
                      </span>
                    </>
                  );
                }}
              </For>
            </div>
          </div>

          <Show when={s.errorInfo()}>
            {(err) => (
              <div class="mb-4 rounded-md bg-destructive/10 px-3 py-2">
                <p class="text-sm text-destructive">{err().description}</p>
                <Show when={err().command}>
                  <p class="mt-1 text-xs text-muted-foreground">
                    Command: <code>{err().command}</code>
                  </p>
                </Show>
                <Show when={err().output}>
                  <pre class="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">
                    {err().output}
                  </pre>
                </Show>
              </div>
            )}
          </Show>
        </div>

        <form onSubmit={s.handleSubmit} class="border-t border-border px-6 py-3">
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={s.close}
              class="btn-secondary"
              data-testid="ticket-cleanup-cancel"
            >Cancel</button>
            <button
              type="submit"
              disabled={s.busy()}
              title={modEnterHint()}
              class={props.action === "delete" ? "btn-destructive" : "btn-primary"}
              data-testid="ticket-cleanup-submit"
            >{s.actionLabel()}</button>
          </div>
        </form>
      </FloatingPanelBody>
    </FloatingWindow>
  );
}
