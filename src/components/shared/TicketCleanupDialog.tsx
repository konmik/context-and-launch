import { Show, For, createEffect } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
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
  onSubmit: (
    folderName: string, cleanup: TicketCleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  ctrl?: TicketCleanupController;
}

const rows: {
  key: CleanupItemKey; label: string; checkboxTestId: string; statusTestId: string;
}[] = [
  { key: "stopHerdrAgent", label: "Stop the Herdr agent",
    checkboxTestId: "ticket-cleanup-stop-herdr-checkbox",
    statusTestId: "ticket-cleanup-stop-herdr-status" },
  { key: "deleteWorktree", label: "Delete worktree",
    checkboxTestId: "ticket-cleanup-delete-worktree-checkbox",
    statusTestId: "ticket-cleanup-delete-worktree-status" },
  { key: "deleteLocalBranch", label: "Delete local branch",
    checkboxTestId: "ticket-cleanup-delete-local-checkbox",
    statusTestId: "ticket-cleanup-delete-local-status" },
  { key: "deleteRemoteBranch", label: "Delete remote branch",
    checkboxTestId: "ticket-cleanup-delete-remote-checkbox",
    statusTestId: "ticket-cleanup-delete-remote-status" },
];

export default function TicketCleanupDialog(props: TicketCleanupDialogProps) {
  const s = props.ctrl ?? createTicketCleanupController({
    projectSlug: () => props.projectSlug,
    ticket: () => props.ticket,
    action: () => props.action,
    loadStatus: getCleanupStatus,
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
  });

  createEffect(() => {
    if (props.open && props.ticket) void s.startChecks();
  });

  useModEnterSubmit({
    onSubmit: () => void s.doSubmit(),
    disabled: () => s.submitting(),
    active: () => props.open && !!props.ticket,
  });

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={s.close} class="max-w-[35rem]">
      <DialogTitle>{s.actionLabel()} Ticket</DialogTitle>
      <DialogDescription>{s.actionLabel()} ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>

      <div class="mb-4 space-y-2">
        <p class="text-sm font-medium">Cleanup</p>
        <For each={rows}>
          {(row) => {
            const item = () => s.items()[row.key];
            return (
              <div class="text-sm">
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.isChecked(row.key)}
                    disabled={item().state !== "ready"}
                    onChange={(e) => s.updateOption(row.key, e.currentTarget.checked)}
                    data-testid={row.checkboxTestId}
                  />
                  {row.label}
                </label>
                <span
                  class="block break-words pl-6 text-xs"
                  data-testid={row.statusTestId}
                  data-state={item().state}
                >
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
                </span>
              </div>
            );
          }}
        </For>
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

      <form onSubmit={s.handleSubmit}>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={s.close}
            class="btn-secondary"
            data-testid="ticket-cleanup-cancel"
          >Cancel</button>
          <button
            type="submit"
            disabled={s.submitting()}
            title={modEnterHint()}
            class={props.action === "delete" ? "btn-destructive" : "btn-primary"}
            data-testid="ticket-cleanup-submit"
          >{s.actionLabel()}</button>
        </div>
      </form>
    </DialogRoot>
  );
}
