import { createSignal, createEffect, Show } from "solid-js";
import { Dialog } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import type { TicketInfo } from "~/types.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

interface EditTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (folderName: string, number: string, title: string) => Promise<{ error?: string }>;
}

export default function EditTicketDialog(props: EditTicketDialogProps) {
  const [number, setNumber] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");

  createEffect(() => {
    if (props.ticket && props.open) {
      setNumber(props.ticket.number);
      setTitle(props.ticket.title);
      setErrorMsg("");
    }
  });

  function close() {
    props.onOpenChange(false);
    setErrorMsg("");
  }

  async function doSubmit() {
    if (!props.ticket || !number().trim() || !title().trim()) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await props.onSubmit(props.ticket.folderName, number().trim(), title().trim());
      if (result?.error) setErrorMsg(result.error);
      else close();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  useModEnterSubmit({
    onSubmit: doSubmit,
    disabled: () => submitting() || !number().trim() || !title().trim(),
    active: () => props.open,
  });

  return (
    <Dialog.Root open={props.open && !!props.ticket} onOpenChange={(d) => { if (!d.open) close(); }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Title>Edit Ticket</Dialog.Title>
            <form onSubmit={(e) => { e.preventDefault(); doSubmit(); }}>
              <div class="mb-4">
                <label for="edit-number" class="mb-2 block text-sm font-medium">Number</label>
                <input id="edit-number" type="text" value={number()} onInput={(e) => setNumber(e.currentTarget.value)} class="input" />
              </div>
              <div class="mb-4">
                <label for="edit-title" class="mb-2 block text-sm font-medium">Title</label>
                <input id="edit-title" type="text" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} class="input" />
              </div>
              <Show when={errorMsg()}><p class="mb-4 text-sm text-destructive">{errorMsg()}</p></Show>
              <div class="flex justify-end gap-2">
                <button type="button" onClick={close} class="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting() || !number().trim() || !title().trim()} title={modEnterHint()} class="btn-primary">Save</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
