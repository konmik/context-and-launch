import { createSignal, createResource, createEffect, onMount, onCleanup, Show } from "solid-js";
import { previewProjectPaths } from "~/server/actions";

interface AddProjectFormProps {
  action: (path: string, branch: string, worktreeRootPath: string) => Promise<{ slug?: string; error?: string }>;
  errorMessage?: string;
  onSuccess?: (slug: string) => void;
  submitTitle?: string;
}

export default function AddProjectForm(props: AddProjectFormProps) {
  const [pathValue, setPathValue] = createSignal("");
  const [branchValue, setBranchValue] = createSignal("tickets");
  const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
  const [worktreeTouched, setWorktreeTouched] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [localError, setLocalError] = createSignal(props.errorMessage ?? "");

  const [canBrowse, setCanBrowse] = createSignal(false);
  onMount(() => setCanBrowse("showDirectoryPicker" in globalThis.window));

  const [debouncedPath, setDebouncedPath] = createSignal("");
  createEffect(() => {
    const p = pathValue().trim();
    const handle = setTimeout(() => setDebouncedPath(p), 300);
    onCleanup(() => clearTimeout(handle));
  });
  const [preview] = createResource(() => debouncedPath() || null, (p) => previewProjectPaths(p));

  createEffect(() => {
    const p = preview();
    if (p && !worktreeTouched()) setWorktreeRootPath(p.defaultWorktreesPath);
  });

  async function pickDirectoryName(): Promise<string | null> {
    try {
      const handle = await (globalThis.window as any).showDirectoryPicker();
      return handle.name;
    } catch (err: any) {
      if (err?.name === "AbortError") return null;
      setLocalError(err?.message ?? "Failed to pick directory");
      return null;
    }
  }

  async function handleBrowsePath() {
    const name = await pickDirectoryName();
    if (name) setPathValue(name);
  }

  async function handleBrowseWorktreeRoot() {
    const name = await pickDirectoryName();
    if (name) { setWorktreeTouched(true); setWorktreeRootPath(name); }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting()) return;
    const trimmed = pathValue().trim();
    if (!trimmed) return;
    const branch = branchValue().trim() || "tickets";
    setSubmitting(true); setLocalError("");
    try {
      const result = await props.action(trimmed, branch, worktreeRootPath().trim());
      if (result.error) setLocalError(result.error);
      else if (result.slug) props.onSuccess?.(result.slug);
    } catch (err: any) { setLocalError(err?.message ?? "Unknown error"); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div class="mb-4">
        <label for="project-path" class="mb-2 block text-sm font-medium">Git Repository Path</label>
        <div class="flex gap-2">
          <input id="project-path" type="text" value={pathValue()} onInput={(e) => setPathValue(e.currentTarget.value)} placeholder="/path/to/your/repo" class="input" />
          <Show when={canBrowse()}>
            <button type="button" onClick={handleBrowsePath} class="btn-secondary">Browse</button>
          </Show>
        </div>
      </div>
      <div class="mb-4">
        <label for="project-branch" class="mb-2 block text-sm font-medium">Tickets branch name</label>
        <input id="project-branch" type="text" value={branchValue()} onInput={(e) => setBranchValue(e.currentTarget.value)} placeholder="tickets" class="input" />
      </div>
      <div class="mb-4">
        <label for="project-worktree-root" class="mb-2 block text-sm font-medium">Agent worktree root path</label>
        <div class="flex gap-2">
          <input id="project-worktree-root" type="text" value={worktreeRootPath()} onInput={(e) => { setWorktreeTouched(true); setWorktreeRootPath(e.currentTarget.value); }} placeholder="Defaults to the location shown below" class="input" />
          <Show when={canBrowse()}>
            <button type="button" onClick={handleBrowseWorktreeRoot} class="btn-secondary">Browse</button>
          </Show>
        </div>
      </div>
      <Show when={preview()}>
        {(p) => (
          <dl class="mb-4 space-y-2 text-xs text-muted-foreground">
            <div>
              <dt class="font-medium">Tickets location</dt>
              <dd class="break-all font-mono" data-testid="tickets-location">{p().ticketsPath}</dd>
            </div>
            <div>
              <dt class="font-medium">Worktrees location</dt>
              <dd class="break-all font-mono" data-testid="worktrees-location">{worktreeRootPath().trim() || p().defaultWorktreesPath}</dd>
            </div>
          </dl>
        )}
      </Show>
      <Show when={localError()}><p class="mb-4 text-sm text-destructive">{localError()}</p></Show>
      <button type="submit" disabled={submitting() || !pathValue().trim()} title={props.submitTitle} class="btn-primary w-full">
        Add Project
      </button>
    </form>
  );
}
