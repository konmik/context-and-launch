import { createSignal, createEffect, on } from "solid-js";
import { createFormDialogController } from "./form-dialog-controller.js";

export interface CreateTicketDeps {
  onSubmit: (number: string, title: string) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  suggestedNextNumber: () => string | null | undefined;
  open: () => boolean;
}

export function createCreateTicketController(deps: CreateTicketDeps) {
  const initial = deps.open() && deps.suggestedNextNumber()
    ? deps.suggestedNextNumber()! : "";
  const [number, setNumber] = createSignal(initial);
  const [title, setTitle] = createSignal("");

  createEffect(on(
    deps.open,
    (isOpen) => {
      const suggested = deps.suggestedNextNumber();
      if (isOpen && suggested) setNumber(suggested);
    },
    { defer: true },
  ));

  function resetFields() {
    setNumber("");
    setTitle("");
  }

  const form = createFormDialogController({
    onSubmit: deps.onSubmit,
    onOpenChange: (open) => {
      if (!open) resetFields();
      deps.onOpenChange(open);
    },
  });

  async function doSubmit() {
    if (!number().trim() || !title().trim()) return;
    await form.doSubmit(number().trim(), title().trim());
  }

  return {
    number, title, submitting: form.submitting, errorMsg: form.errorMsg,
    setNumber, setTitle, close: form.close, doSubmit,
  };
}

export type CreateTicketController = ReturnType<typeof createCreateTicketController>;
