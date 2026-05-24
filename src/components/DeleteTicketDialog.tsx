import { createSignal, Show } from "solid-js";
import type { TicketInfo } from "~/types.js";
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

  function close() {
    props.onOpenChange(false);
    setErrorMsg("");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  async function doSubmit() {
    if (!props.ticket) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await props.onSubmit(props.ticket.folderName);
      if (result?.error) {
        setErrorMsg(result.error);
      } else {
        close();
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    doSubmit();
  }

  useModEnterSubmit({
    onSubmit: doSubmit,
    disabled: () => submitting(),
    active: () => props.open && !!props.ticket,
  });

  return (
    <Show when={props.open && props.ticket}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onKeyDown={handleKeydown}
      >
        <div class="fixed inset-0" onClick={close} />
        <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-semibold">Delete Ticket</h2>
          <p class="mb-4 text-sm text-muted-foreground">
            Delete ticket {props.ticket!.number} - {props.ticket!.title}?
          </p>

          <Show when={errorMsg()}>
            <p class="mb-4 text-sm text-destructive">{errorMsg()}</p>
          </Show>

          <form onSubmit={handleSubmit}>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting()}
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting() ? "Deleting..." : "Delete"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
