import { createSignal, createEffect, Show, For } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "../ui/dialog";

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (profileName: string) => Promise<void>;
  onAbort: () => Promise<void>;
  projectSlug: string;
}

export default function ConflictDialog(props: ConflictDialogProps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");
  const [profiles, setProfiles] = createSignal<{ name: string }[]>([]);
  const [selectedProfile, setSelectedProfile] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setErrorMsg("");
      fetch(`/api/projects/${props.projectSlug}/launcher-config`)
        .then(r => r.json())
        .then(data => {
          const list = (data.profiles ?? []).map((p: any) => ({ name: p.name }));
          setProfiles(list);
          if (list.length > 0 && !selectedProfile()) setSelectedProfile(list[0].name);
        })
        .catch(() => setErrorMsg("Failed to load profiles"));
    }
  });

  function close() { props.onOpenChange(false); setErrorMsg(""); }

  async function submit(action: () => Promise<void>, fallbackMsg: string) {
    setSubmitting(true);
    setErrorMsg("");
    try { await action(); close(); }
    catch (err) { setErrorMsg(err instanceof Error ? err.message : fallbackMsg); }
    finally { setSubmitting(false); }
  }

  return (
    <DialogRoot open={props.open} onOpenChange={close} closeOnInteractOutside={false}>
      <DialogTitle>Sync Conflicts Detected</DialogTitle>
      <DialogDescription>The sync encountered conflicts during rebase. You can launch an AI agent to resolve them, or abort to keep your local changes and retry later.</DialogDescription>

      <div class="mb-4">
        <label class="mb-1 block text-sm font-medium">Profile</label>
        <select value={selectedProfile()} onChange={(e) => setSelectedProfile(e.currentTarget.value)} class="input input-sm" data-testid="conflict-profile-select">
          <For each={profiles()}>{(p) => <option value={p.name}>{p.name}</option>}</For>
        </select>
      </div>

      <Show when={errorMsg()}><p class="mb-4 text-sm text-destructive">{errorMsg()}</p></Show>

      <div class="flex items-center justify-between">
        <button
          type="button"
          onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "tickets", projectSlug: props.projectSlug }) })}
          class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          title="Open tickets directory"
        >Tickets repo &#8599;</button>
        <div class="flex gap-2">
          <button type="button" onClick={close} disabled={submitting()} class="btn-secondary">Close</button>
          <button type="button" onClick={() => submit(props.onAbort, "Failed to abort")} disabled={submitting()} class="btn-secondary">Abort</button>
          <button type="button" onClick={() => submit(() => props.onResolve(selectedProfile()), "Failed to launch resolver")} disabled={submitting() || !selectedProfile()} class="btn-primary">Launch</button>
        </div>
      </div>
    </DialogRoot>
  );
}
