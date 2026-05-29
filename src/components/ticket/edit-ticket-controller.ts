import { createSignal, createEffect, on } from "solid-js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import { createFormDialogController } from "./form-dialog-controller.js";

export interface EditTicketDeps {
  onSubmit: (
    folderName: string, number: string, title: string,
  ) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  ticket: () => TicketInfo | null;
  open: () => boolean;
}

export function createEditTicketController(deps: EditTicketDeps) {
  const t = deps.ticket();
  const initialOpen = deps.open();
  const [number, setNumber] = createSignal(
    t && initialOpen ? t.number : "",
  );
  const [title, setTitle] = createSignal(
    t && initialOpen ? t.title : "",
  );

  const form = createFormDialogController({
    onSubmit: deps.onSubmit,
    onOpenChange: deps.onOpenChange,
  });

  createEffect(on(
    deps.open,
    (isOpen) => {
      const ticket = deps.ticket();
      if (ticket && isOpen) {
        setNumber(ticket.number);
        setTitle(ticket.title);
        form.setErrorMsg("");
      }
    },
    { defer: true },
  ));

  async function doSubmit() {
    const ticket = deps.ticket();
    if (!ticket || !number().trim() || !title().trim()) return;
    await form.doSubmit(ticket.folderName, number().trim(), title().trim());
  }

  return {
    number, title, submitting: form.submitting, errorMsg: form.errorMsg,
    setNumber, setTitle, close: form.close, doSubmit,
  };
}

export type EditTicketController = ReturnType<typeof createEditTicketController>;
