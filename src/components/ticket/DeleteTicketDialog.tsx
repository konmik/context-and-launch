import { Show } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  createDeleteTicketController,
  type DeleteTicketController,
} from "./delete-ticket-controller.js";

interface DeleteTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (folderName: string) => Promise<{ error?: string }>;
  ctrl?: DeleteTicketController;
}

export default function DeleteTicketDialog(props: DeleteTicketDialogProps) {
  const s = props.ctrl ?? createDeleteTicketController({
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
    ticket: () => props.ticket,
  });

  useModEnterSubmit({
    onSubmit: s.doSubmit,
    disabled: () => s.submitting(),
    active: () => props.open && !!props.ticket,
  });

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={s.close}>
      <DialogTitle>Delete Ticket</DialogTitle>
      <DialogDescription>Delete ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>
      <Show when={s.errorMsg()}><p class="mb-4 text-sm text-destructive">{s.errorMsg()}</p></Show>
      <form onSubmit={(e) => { e.preventDefault(); s.doSubmit(); }}>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={s.close}
            class="btn-secondary"
            data-testid="delete-ticket-cancel"
          >Cancel</button>
          <button
            type="submit"
            disabled={s.submitting()}
            title={modEnterHint()}
            class="btn-destructive"
            data-testid="delete-ticket-submit"
          >Delete</button>
        </div>
      </form>
    </DialogRoot>
  );
}
