import { createSignal, Show } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "./ui/dialog";
import type { TicketInfo } from "~/server/ticket-store.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

interface DeleteTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (folderName: string) => Promise<{ error?: string }>;
}

export default function DeleteTicketDialog(props: DeleteTicketDialogProps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");

  function close() { props.onOpenChange(false); setErrorMsg(""); }

  async function doSubmit() {
    if (!props.ticket) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await props.onSubmit(props.ticket.folderName);
      if (result?.error) setErrorMsg(result.error);
      else close();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  useModEnterSubmit({ onSubmit: doSubmit, disabled: () => submitting(), active: () => props.open && !!props.ticket });

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={close}>
      <DialogTitle>Delete Ticket</DialogTitle>
      <DialogDescription>Delete ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>
      <Show when={errorMsg()}><p class="mb-4 text-sm text-destructive">{errorMsg()}</p></Show>
      <form onSubmit={(e) => { e.preventDefault(); doSubmit(); }}>
        <div class="flex justify-end gap-2">
          <button type="button" onClick={close} class="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting()} title={modEnterHint()} class="btn-destructive">Delete</button>
        </div>
      </form>
    </DialogRoot>
  );
}
