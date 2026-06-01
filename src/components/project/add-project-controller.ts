import { createSignal, createEffect, onCleanup } from "solid-js";
import { type ProjectPathsPreview, applyPreview } from "./add-project-pure.js";

export interface AddProjectControllerDeps {
  action: (
    path: string, branch: string, worktreeRootPath: string, ticketsPath: string,
    mainBranch: string, boardId: string,
  ) => Promise<{ projectSlug?: string; error?: string }>;
  onSuccess?: (projectSlug: string) => void;
  errorMessage?: string;
}

export function createAddProjectController(deps: AddProjectControllerDeps) {
  const [pathValue, setPathValue] = createSignal("");
  const [branchValue, setBranchValue] = createSignal("tickets");
  const [ticketsRootPath, setTicketsRootPath] = createSignal("");
  const [ticketsTouched, setTicketsTouched] = createSignal(false);
  const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
  const [worktreeTouched, setWorktreeTouched] = createSignal(false);
  const [mainBranchValue, setMainBranchValue] = createSignal("");
  const [mainBranchTouched, setMainBranchTouched] = createSignal(false);
  const [boardId, setBoardId] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [localError, setLocalError] = createSignal(deps.errorMessage ?? "");
  const [preview, setPreview] = createSignal<ProjectPathsPreview | null>(null);

  const [debouncedPath, setDebouncedPath] = createSignal("");
  createEffect(() => {
    const p = pathValue().trim();
    const handle = setTimeout(() => setDebouncedPath(p), 300);
    onCleanup(() => clearTimeout(handle));
  });

  createEffect(() => {
    const p = debouncedPath();
    if (!p) { setPreview(null); return; }
    let cancelled = false;
    fetch(`/api/projects?previewPath=${encodeURIComponent(p)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to compute paths (${res.status})`);
        return res.json();
      })
      .then((res) => { if (!cancelled) setPreview(res); })
      .catch((err: any) => { if (!cancelled) setLocalError(err?.message ?? "Failed to compute paths"); });
    onCleanup(() => { cancelled = true; });
  });

  createEffect(() => {
    const applied = applyPreview(preview(), ticketsTouched(), worktreeTouched(), mainBranchTouched());
    if (applied.ticketsRootPath !== undefined) setTicketsRootPath(applied.ticketsRootPath);
    if (applied.worktreeRootPath !== undefined) setWorktreeRootPath(applied.worktreeRootPath);
    if (applied.mainBranch !== undefined) setMainBranchValue(applied.mainBranch);
  });

  async function pickDirectory(current: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/pick-directory?path=${encodeURIComponent(current)}`);
      if (res.status === 204) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLocalError(body?.error ?? `Directory picker failed (${res.status})`);
        return null;
      }
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
    setSubmitting(true);
    setLocalError("");
    try {
      const result = await deps.action(
        trimmed, branch, worktreeRootPath().trim(), ticketsRootPath().trim(),
        mainBranchValue().trim(), boardId(),
      );
      if (result.error) setLocalError(result.error);
      else if (result.projectSlug) deps.onSuccess?.(result.projectSlug);
    } catch (err: any) {
      setLocalError(err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    pathValue, branchValue, ticketsRootPath, worktreeRootPath,
    mainBranchValue, boardId,
    submitting, localError, setLocalError, preview,
    setPathValue, setBranchValue,
    setTicketsRootPath: (v: string) => { setTicketsTouched(true); setTicketsRootPath(v); },
    setWorktreeRootPath: (v: string) => { setWorktreeTouched(true); setWorktreeRootPath(v); },
    setMainBranchValue: (v: string) => { setMainBranchTouched(true); setMainBranchValue(v); },
    setBoardId,
    handleBrowsePath, handleBrowseTicketsRoot, handleBrowseWorktreeRoot,
    handleSubmit,
  };
}

export type AddProjectController = ReturnType<typeof createAddProjectController>;
