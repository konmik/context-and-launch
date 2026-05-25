import { createSignal, createEffect, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (number: string, title: string) => Promise<{ error?: string }>;
  suggestedNextNumber?: string | null;
}

export default function CreateTicketDialog(props: CreateTicketDialogProps) {
  const [number, setNumber] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");

  createEffect(() => {
    if (props.open && props.suggestedNextNumber) {
      setNumber(props.suggestedNextNumber);
    }
  });

  function close() {
    props.onOpenChange(false);
    setNumber("");
    setTitle("");
    setErrorMsg("");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  async function doSubmit() {
    if (!number().trim() || !title().trim()) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await props.onSubmit(number().trim(), title().trim());
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

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    doSubmit();
  }

  useModEnterSubmit({
    onSubmit: doSubmit,
    disabled: () => submitting() || !number().trim() || !title().trim(),
    active: () => props.open,
  });

  return (
    <Show when={props.open}>
      <Portal>
      <div
        class="fixed inset-0 flex items-center justify-center bg-black/50"
        onKeyDown={handleKeydown}
      >
        <div class="fixed inset-0" onClick={close} />
        <div class="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-semibold">New Ticket</h2>
          <form onSubmit={handleSubmit}>
            <div class="mb-4">
              <label for="ticket-number" class="mb-2 block text-sm font-medium">
                Number
              </label>
              <input
                id="ticket-number"
                type="text"
                value={number()}
                onInput={(e) => setNumber(e.currentTarget.value)}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="e.g. ABC-1"
              />
            </div>
            <div class="mb-4">
              <label for="ticket-title" class="mb-2 block text-sm font-medium">
                Title
              </label>
              <input
                id="ticket-title"
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="e.g. Fix login timeout"
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
                title={modEnterHint()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      </div>
      </Portal>
    </Show>
  );
}
