import { Show } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import {
  createArchiveTicketController,
  type ArchiveTicketController,
} from "./archive-ticket-controller.js";

interface ArchiveTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (folderName: string) => Promise<{ error?: string }>;
  ctrl?: ArchiveTicketController;
}

export default function ArchiveTicketDialog(props: ArchiveTicketDialogProps) {
  const s = props.ctrl ?? createArchiveTicketController({
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
    ticket: () => props.ticket,
  });

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={s.close}>
      <DialogTitle>Archive Ticket</DialogTitle>
      <DialogDescription>Archive ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>
      <Show when={s.errorMsg()}><p class="mb-4 text-sm text-destructive">{s.errorMsg()}</p></Show>
      <form onSubmit={s.handleSubmit}>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={s.close}
            class="btn-secondary"
            data-testid="archive-ticket-cancel"
          >Cancel</button>
          <button
            type="submit"
            disabled={s.submitting()}
            class="btn-primary"
            data-testid="archive-ticket-submit"
          >Archive</button>
        </div>
      </form>
    </DialogRoot>
  );
}
