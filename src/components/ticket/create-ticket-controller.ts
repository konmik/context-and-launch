import { createMemo, createSignal } from "solid-js";
import { createFormDialogController } from "./form-dialog-controller.js";

export interface CreateTicketDeps {
  onSubmit: (number: string, title: string) => Promise<{ error?: string }>;
  onOpenChange: (open: boolean) => void;
  suggestedNextNumber: () => string | null | undefined;
  open: () => boolean;
  onSuggestNumber: (numberInput: string) => Promise<string | null>;
}

export function createCreateTicketController(deps: CreateTicketDeps) {
  // The number field shows the board's suggestion until someone picks a number,
  // then it shows that pick. Deriving it means a late-arriving suggestion still
  // fills an untouched field, while the revalidation that a regenerate call
  // triggers cannot put the board's suggestion back over the user's choice.
  const [chosenNumber, setChosenNumber] = createSignal<string>();
  const number = createMemo(
    () => chosenNumber() ?? (deps.open() ? deps.suggestedNextNumber() ?? "" : ""),
  );
  const setNumber = (value: string) => setChosenNumber(value);
  const [title, setTitle] = createSignal("");
  const [suggestingNumber, setSuggestingNumber] = createSignal(false);

  function resetFields() {
    setChosenNumber(undefined);
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
