import { Show } from "solid-js";
import { DialogRoot, DialogTitle } from "../ui/dialog";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  createEditTicketController,
  type EditTicketController,
} from "./edit-ticket-controller.js";

interface EditTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (folderName: string, number: string, title: string) => Promise<{ error?: string }>;
  ctrl?: EditTicketController;
}

export default function EditTicketDialog(props: EditTicketDialogProps) {
  const s = props.ctrl ?? createEditTicketController({
    onSubmit: props.onSubmit,
    onOpenChange: props.onOpenChange,
    ticket: () => props.ticket,
    open: () => props.open,
  });

  useModEnterSubmit({
    onSubmit: s.doSubmit,
    disabled: () => s.submitting() || !s.number().trim() || !s.title().trim(),
    active: () => props.open,
  });

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={s.close}>
      <DialogTitle>Edit Ticket</DialogTitle>
      <form onSubmit={(e) => { e.preventDefault(); s.doSubmit(); }}>
        <div class="mb-4">
          <label for="edit-number" class="mb-2 block text-sm font-medium">Number</label>
          <input
            id="edit-number"
            type="text"
            value={s.number()}
            onInput={(e) => s.setNumber(e.currentTarget.value)}
            class="input"
            data-testid="edit-ticket-number-input"
          />
        </div>
        <div class="mb-4">
          <label for="edit-title" class="mb-2 block text-sm font-medium">Title</label>
          <input
            id="edit-title"
            type="text"
            value={s.title()}
            onInput={(e) => s.setTitle(e.currentTarget.value)}
            class="input"
            data-testid="edit-ticket-title-input"
          />
        </div>
        <Show when={s.errorMsg()}><p class="mb-4 text-sm text-destructive">{s.errorMsg()}</p></Show>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={s.close}
            class="btn-secondary"
            data-testid="edit-ticket-cancel"
          >Cancel</button>
          <button
            type="submit"
            disabled={s.submitting() || !s.number().trim() || !s.title().trim()}
            title={modEnterHint()}
            class="btn-primary"
            data-testid="edit-ticket-submit"
          >Save</button>
        </div>
      </form>
    </DialogRoot>
  );
}
