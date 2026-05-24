import { createSignal, createEffect, Show } from "solid-js";
import type { TicketInfo } from "~/types.js";

interface EditTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  onSubmit: (
    folderName: string,
    number: string,
    title: string
  ) => Promise<{ error?: string }>;
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!props.ticket || !number().trim() || !title().trim()) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await props.onSubmit(
        props.ticket.folderName,
        number().trim(),
        title().trim()
      );
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

  return (
    <Show when={props.open && props.ticket}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onKeyDown={handleKeydown}
      >
        <div class="fixed inset-0" onClick={close} />
        <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-semibold">Edit Ticket</h2>
          <form onSubmit={handleSubmit}>
            <div class="mb-4">
              <label for="edit-number" class="mb-2 block text-sm font-medium">
                Number
              </label>
              <input
                id="edit-number"
                type="text"
                value={number()}
                onInput={(e) => setNumber(e.currentTarget.value)}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div class="mb-4">
              <label for="edit-title" class="mb-2 block text-sm font-medium">
                Title
              </label>
              <input
                id="edit-title"
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <Show when={errorMsg()}>
              <p class="mb-4 text-sm text-destructive">{errorMsg()}</p>
            </Show>

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
                disabled={submitting() || !number().trim() || !title().trim()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting() ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}
