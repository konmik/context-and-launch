import { createSignal, Show } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "./ui/dialog";
import type { TicketInfo } from "~/types.js";

interface ArchiveTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (folderName: string) => Promise<{ error?: string }>;
}

export default function ArchiveTicketDialog(props: ArchiveTicketDialogProps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");

  function close() { props.onOpenChange(false); setErrorMsg(""); }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
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

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={close}>
      <DialogTitle>Archive Ticket</DialogTitle>
      <DialogDescription>Archive ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>
      <Show when={errorMsg()}><p class="mb-4 text-sm text-destructive">{errorMsg()}</p></Show>
      <form onSubmit={handleSubmit}>
        <div class="flex justify-end gap-2">
          <button type="button" onClick={close} class="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting()} class="btn-primary">Archive</button>
        </div>
      </form>
    </DialogRoot>
  );
}
