import { Show } from "solid-js";
import { DialogRoot, DialogTitle } from "./ui/dialog";
import type { ErrorInfo } from "~/types.js";

interface ErrorDialogProps {
  error: ErrorInfo | null;
  onClose: () => void;
}

export default function ErrorDialog(props: ErrorDialogProps) {
  return (
    <DialogRoot open={!!props.error} onOpenChange={props.onClose} class="flex max-h-[80vh] max-w-lg flex-col p-0">
      <div class="flex-none px-6 pt-6 pb-2">
        <DialogTitle class="mb-0 text-sm">{props.error?.description}</DialogTitle>
      </div>
      <div class="flex-1 overflow-y-auto px-6">
        <Show when={props.error?.command}>
          <div class="mt-2">
            <p class="mb-1 text-xs text-muted-foreground">Command</p>
            <pre class="whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 text-xs">{props.error!.command}</pre>
          </div>
        </Show>
        <Show when={props.error?.output}>
          <div class="mt-2">
            <p class="mb-1 text-xs text-muted-foreground">Output</p>
            <pre class="max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-destructive bg-muted px-3 py-2 text-xs">{props.error!.output}</pre>
          </div>
        </Show>
      </div>
      <div class="flex flex-none justify-end px-6 pt-4 pb-6">
        <button onClick={props.onClose} class="btn-primary">OK</button>
      </div>
    </DialogRoot>
  );
}
