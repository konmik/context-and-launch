import { createSignal, createEffect, on } from "solid-js";
import { createFormDialogController } from "./form-dialog-controller.js";

export interface CreateTicketDeps {
  onSubmit: (number: string, title: string) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  suggestedNextNumber: () => string | null | undefined;
  open: () => boolean;
  onSuggestNumber: (numberInput: string) => Promise<string | null>;
}

export function createCreateTicketController(deps: CreateTicketDeps) {
  const initial = deps.open() && deps.suggestedNextNumber()
    ? deps.suggestedNextNumber()! : "";
  const [number, setNumber] = createSignal(initial);
  const [title, setTitle] = createSignal("");
  const [suggestingNumber, setSuggestingNumber] = createSignal(false);

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
    if (suggestingNumber()) return;
    if (!number().trim() || !title().trim()) return;
    await form.doSubmit(number().trim(), title().trim());
  }

  async function suggestNumber() {
    setSuggestingNumber(true);
    try {
      const result = await deps.onSuggestNumber(number());
      if (result != null) setNumber(result);
    } catch (err: any) {
      form.setErrorMsg(err?.message ?? "Unknown error");
    } finally {
      setSuggestingNumber(false);
    }
  }

  return {
    number, title, submitting: form.submitting, errorMsg: form.errorMsg,
    setNumber, setTitle, close: form.close, doSubmit,
    suggestingNumber, suggestNumber,
  };
}

export type CreateTicketController = ReturnType<typeof createCreateTicketController>;
