import { Show } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ErrorInfo } from "~/server/shared/errors.js";
import type { CleanupOptions } from "./worktree-cleanup-pure.js";
import {
  createWorktreeCleanupController,
  type WorktreeCleanupController,
} from "./worktree-cleanup-controller.js";

interface WorktreeCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  action: "archive" | "delete";
  onSubmit: (folderName: string, cleanup: CleanupOptions) => Promise<{ error?: string | ErrorInfo }>;
  ctrl?: WorktreeCleanupController;
}

export default function WorktreeCleanupDialog(props: WorktreeCleanupDialogProps) {
  const s = props.ctrl ?? createWorktreeCleanupController({
    ticket: () => props.ticket,
    action: () => props.action,
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
  });

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={s.close}>
      <DialogTitle>{s.actionLabel()} Ticket</DialogTitle>
      <DialogDescription>{s.actionLabel()} ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>

      <div class="mb-4 space-y-2">
        <p class="text-sm font-medium">Worktree cleanup</p>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.options().deleteWorktree}
            onChange={(e) => s.updateOption("deleteWorktree", e.currentTarget.checked)}
          />
          Delete worktree
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.options().deleteLocalBranch}
            onChange={(e) => s.updateOption("deleteLocalBranch", e.currentTarget.checked)}
          />
          Delete local branch
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.options().deleteRemoteBranch}
            onChange={(e) => s.updateOption("deleteRemoteBranch", e.currentTarget.checked)}
          />
          Delete remote branch
        </label>
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
          <button type="button" onClick={s.close} class="btn-secondary">Cancel</button>
          <button
            type="submit"
            disabled={s.submitting()}
            class={props.action === "delete" ? "btn-destructive" : "btn-primary"}
          >{s.actionLabel()}</button>
        </div>
      </form>
    </DialogRoot>
  );
}
