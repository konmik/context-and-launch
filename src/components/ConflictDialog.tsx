import { createSignal, createEffect, Show, For } from "solid-js";

interface ProfileOption {
  name: string;
}

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (profileName: string) => Promise<void>;
  onAbort: () => Promise<void>;
  slug: string;
}

export default function ConflictDialog(props: ConflictDialogProps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal("");
  const [profiles, setProfiles] = createSignal<ProfileOption[]>([]);
  const [selectedProfile, setSelectedProfile] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setErrorMsg("");
      fetch(`/api/projects/${props.slug}/launcher-config`)
        .then(r => r.json())
        .then(data => {
          const list: ProfileOption[] = (data.profiles ?? []).map((p: any) => ({ name: p.name }));
          setProfiles(list);
          if (list.length > 0 && !selectedProfile()) {
            setSelectedProfile(list[0].name);
          }
        })
        .catch(() => setErrorMsg("Failed to load profiles"));
    }
  });

  function close() {
    props.onOpenChange(false);
    setErrorMsg("");
  }

  async function submit(action: () => Promise<void>, fallbackMsg: string) {
    setSubmitting(true);
    setErrorMsg("");
    try {
      await action();
      close();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : fallbackMsg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      >
        <div class="fixed inset-0" />
        <div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-semibold">Sync Conflicts Detected</h2>
          <p class="mb-4 text-sm text-muted-foreground">
            The sync encountered conflicts during rebase. You can launch an AI agent to resolve them, or abort to keep your local changes and retry later.
          </p>

          <div class="mb-4">
            <label class="mb-1 block text-sm font-medium">Profile</label>
            <select
              value={selectedProfile()}
              onChange={(e) => setSelectedProfile(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="conflict-profile-select"
            >
              <For each={profiles()}>
                {(p) => <option value={p.name}>{p.name}</option>}
              </For>
            </select>
          </div>

          <Show when={errorMsg()}>
            <p class="mb-4 text-sm text-destructive">{errorMsg()}</p>
          </Show>

          <div class="flex items-center justify-between">
            <button
              type="button"
              onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "tickets", slug: props.slug }) })}
              class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              title="Open tickets directory"
            >
              Tickets repo &#8599;
            </button>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting()}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => submit(props.onAbort, "Failed to abort")}
                disabled={submitting()}
                class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => submit(() => props.onResolve(selectedProfile()), "Failed to launch resolver")}
                disabled={submitting() || !selectedProfile()}
                class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                Launch
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
