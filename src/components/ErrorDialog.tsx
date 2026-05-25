import { Show } from "solid-js";
import type { ErrorInfo } from "~/types.js";

interface ErrorDialogProps {
  error: ErrorInfo | null;
  onClose: () => void;
}

export default function ErrorDialog(props: ErrorDialogProps) {
  return (
    <Show when={props.error}>
      {(err) => (
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div class="fixed inset-0" onClick={props.onClose} />
          <div class="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-lg">
            <div class="flex-none px-6 pt-6 pb-2">
              <p class="text-sm font-medium">{err().description}</p>
            </div>
            <div class="flex-1 overflow-y-auto px-6">
              <Show when={err().command}>
                <div class="mt-2">
                  <p class="mb-1 text-xs text-muted-foreground">Command</p>
                  <pre class="whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 text-xs">{err().command}</pre>
                </div>
              </Show>
              <Show when={err().output}>
                <div class="mt-2">
                  <p class="mb-1 text-xs text-muted-foreground">Output</p>
                  <pre class="max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-destructive bg-muted px-3 py-2 text-xs">{err().output}</pre>
                </div>
              </Show>
            </div>
            <div class="flex flex-none justify-end px-6 pt-4 pb-6">
              <button
                onClick={props.onClose}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
