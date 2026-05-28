import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { previewProjectPaths } from "~/server/actions";

type ProjectPathsPreview = { slug: string; ticketsPath: string; defaultWorktreesPath: string };

interface AddProjectFormProps {
  action: (path: string, branch: string, worktreeRootPath: string, ticketsPath: string) => Promise<{ slug?: string; error?: string }>;
  errorMessage?: string;
  onSuccess?: (slug: string) => void;
  submitTitle?: string;
}

export default function AddProjectForm(props: AddProjectFormProps) {
  const [pathValue, setPathValue] = createSignal("");
  const [branchValue, setBranchValue] = createSignal("tickets");
  const [ticketsRootPath, setTicketsRootPath] = createSignal("");
  const [ticketsTouched, setTicketsTouched] = createSignal(false);
  const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
  const [worktreeTouched, setWorktreeTouched] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [localError, setLocalError] = createSignal(props.errorMessage ?? "");

  const [debouncedPath, setDebouncedPath] = createSignal("");
  createEffect(() => {
    const p = pathValue().trim();
    const handle = setTimeout(() => setDebouncedPath(p), 300);
    onCleanup(() => clearTimeout(handle));
  });

  const [preview, setPreview] = createSignal<ProjectPathsPreview | null>(null);
  createEffect(() => {
    const p = debouncedPath();
    if (!p) { setPreview(null); return; }
    let cancelled = false;
    previewProjectPaths(p)
      .then((res) => { if (!cancelled) setPreview(res); })
      .catch((err: any) => { if (!cancelled) setLocalError(err?.message ?? "Failed to compute paths"); });
    onCleanup(() => { cancelled = true; });
  });

  createEffect(() => {
    const p = preview();
    if (!p) return;
    if (!ticketsTouched()) setTicketsRootPath(p.ticketsPath);
    if (!worktreeTouched()) setWorktreeRootPath(p.defaultWorktreesPath);
  });

  async function pickDirectory(current: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/pick-directory?path=${encodeURIComponent(current)}`);
      if (!res.ok) return null;
      const { path } = await res.json();
      return path;
    } catch (err: any) {
      setLocalError(err?.message ?? "Failed to pick directory");
      return null;
    }
  }

  async function handleBrowsePath() {
    const picked = await pickDirectory(pathValue().trim());
    if (picked) setPathValue(picked);
  }

  async function handleBrowseTicketsRoot() {
    const picked = await pickDirectory(ticketsRootPath().trim());
    if (picked) { setTicketsTouched(true); setTicketsRootPath(picked); }
  }

  async function handleBrowseWorktreeRoot() {
    const picked = await pickDirectory(worktreeRootPath().trim());
    if (picked) { setWorktreeTouched(true); setWorktreeRootPath(picked); }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting()) return;
    const trimmed = pathValue().trim();
    if (!trimmed) return;
    const branch = branchValue().trim() || "tickets";
    setSubmitting(true); setLocalError("");
    try {
      const result = await props.action(trimmed, branch, worktreeRootPath().trim(), ticketsRootPath().trim());
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
          <button type="button" onClick={handleBrowsePath} class="btn-secondary">Browse</button>
        </div>
      </div>
      <div class="mb-4">
        <label for="project-branch" class="mb-2 block text-sm font-medium">Tickets branch name</label>
        <input id="project-branch" type="text" value={branchValue()} onInput={(e) => setBranchValue(e.currentTarget.value)} placeholder="tickets" class="input" />
      </div>
      <div class="mb-4">
        <label for="project-tickets-root" class="mb-2 block text-sm font-medium">Tickets folder</label>
        <div class="flex gap-2">
          <input id="project-tickets-root" type="text" value={ticketsRootPath()} onInput={(e) => { setTicketsTouched(true); setTicketsRootPath(e.currentTarget.value); }} placeholder="Defaults to the project data directory" class="input" />
          <button type="button" onClick={handleBrowseTicketsRoot} class="btn-secondary">Browse</button>
        </div>
      </div>
      <div class="mb-4">
        <label for="project-worktree-root" class="mb-2 block text-sm font-medium">Agent worktree root path</label>
        <div class="flex gap-2">
          <input id="project-worktree-root" type="text" value={worktreeRootPath()} onInput={(e) => { setWorktreeTouched(true); setWorktreeRootPath(e.currentTarget.value); }} placeholder="Defaults to the project data directory" class="input" />
          <button type="button" onClick={handleBrowseWorktreeRoot} class="btn-secondary">Browse</button>
        </div>
      </div>
      <Show when={localError()}><p class="mb-4 text-sm text-destructive">{localError()}</p></Show>
      <button type="submit" disabled={submitting() || !pathValue().trim()} title={props.submitTitle} class="btn-primary w-full">
        Add Project
      </button>
    </form>
  );
}
