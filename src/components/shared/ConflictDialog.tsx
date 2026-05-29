import { Show, For } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";
import {
  createConflictDialogController,
  type ConflictDialogController,
} from "./conflict-dialog-controller.js";

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (profileName: string) => Promise<void>;
  onAbort: () => Promise<void>;
  projectSlug: string;
  ctrl?: ConflictDialogController;
}

export default function ConflictDialog(props: ConflictDialogProps) {
  const s = props.ctrl ?? createConflictDialogController({
    projectSlug: () => props.projectSlug,
    open: () => props.open,
    onResolve: props.onResolve,
    onAbort: props.onAbort,
    onOpenChange: props.onOpenChange,
  });

  return (
    <DialogRoot open={props.open} onOpenChange={s.close} closeOnInteractOutside={false}>
      <DialogTitle>Sync Conflicts Detected</DialogTitle>
      <DialogDescription>
        The sync encountered conflicts during rebase. You can launch an AI agent
        to resolve them, or abort to keep your local changes and retry later.
      </DialogDescription>

      <div class="mb-4">
        <label class="mb-1 block text-sm font-medium">Profile</label>
        <select
          value={s.selectedProfile()}
          onChange={(e) => s.setSelectedProfile(e.currentTarget.value)}
          class="input input-sm"
          data-testid="conflict-profile-select"
        >
          <For each={s.profiles()}>{(p) => <option value={p.name}>{p.name}</option>}</For>
        </select>
      </div>

      <Show when={s.errorMsg()}><p class="mb-4 text-sm text-destructive">{s.errorMsg()}</p></Show>

      <div class="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fetch("/api/open-config-dir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: "tickets", projectSlug: props.projectSlug }),
          })}
          class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          title="Open tickets directory"
        >Tickets repo &#8599;</button>
        <div class="flex gap-2">
          <button type="button" onClick={s.close} disabled={s.submitting()} class="btn-secondary">Close</button>
          <button
            type="button"
            onClick={s.abort}
            disabled={s.submitting()}
            class="btn-secondary"
          >Abort</button>
          <button
            type="button"
            onClick={s.resolve}
            disabled={s.submitting() || !s.selectedProfile()}
            class="btn-primary"
          >Launch</button>
        </div>
      </div>
    </DialogRoot>
  );
}
