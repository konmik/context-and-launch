import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import { createFormDialogController } from "./form-dialog-controller.js";

export interface DeleteTicketDeps {
  onSubmit: (folderName: string) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  ticket: () => TicketInfo | null;
}

export function createDeleteTicketController(deps: DeleteTicketDeps) {
  const form = createFormDialogController({
    onSubmit: deps.onSubmit,
    onOpenChange: deps.onOpenChange,
  });

  async function doSubmit() {
    const ticket = deps.ticket();
    if (!ticket) return;
    await form.doSubmit(ticket.folderName);
  }

  return {
    submitting: form.submitting, errorMsg: form.errorMsg,
    close: form.close, doSubmit,
  };
}

export type DeleteTicketController = ReturnType<typeof createDeleteTicketController>;
