import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import { createFormDialogController } from "./form-dialog-controller.js";

export interface ArchiveTicketDeps {
  onSubmit: (folderName: string) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  ticket: () => TicketInfo | null;
}

export function createArchiveTicketController(deps: ArchiveTicketDeps) {
  const form = createFormDialogController({
    onSubmit: deps.onSubmit,
    onOpenChange: deps.onOpenChange,
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const ticket = deps.ticket();
    if (!ticket) return;
    await form.doSubmit(ticket.folderName);
  }

  return {
    submitting: form.submitting, errorMsg: form.errorMsg,
    close: form.close, handleSubmit,
  };
}

export type ArchiveTicketController = ReturnType<typeof createArchiveTicketController>;
