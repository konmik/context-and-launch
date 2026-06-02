import { createSignal, createEffect, onCleanup } from "solid-js";

export interface AddProjectControllerDeps {
  action: (
    path: string, branch: string, mainBranch: string, boardId: string,
  ) => Promise<{ projectSlug?: string; error?: string }>;
  onSuccess?: (projectSlug: string) => void;
  errorMessage?: string;
}

export function createAddProjectController(deps: AddProjectControllerDeps) {
  const [pathValue, setPathValue] = createSignal("");
  const [branchValue, setBranchValue] = createSignal("tickets");
  const [mainBranchValue, setMainBranchValue] = createSignal("");
  const [mainBranchTouched, setMainBranchTouched] = createSignal(false);
  const [boardId, setBoardId] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [localError, setLocalError] = createSignal(deps.errorMessage ?? "");

  const [debouncedPath, setDebouncedPath] = createSignal("");
  createEffect(() => {
    const p = pathValue().trim();
    const handle = setTimeout(() => setDebouncedPath(p), 300);
    onCleanup(() => clearTimeout(handle));
  });

  createEffect(() => {
    const p = debouncedPath();
    if (!p) { setMainBranchValue(""); return; }
    let cancelled = false;
    fetch(`/api/projects?previewPath=${encodeURIComponent(p)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to compute paths (${res.status})`);
        return res.json();
      })
      .then((res) => {
        if (!cancelled && !mainBranchTouched() && res.mainBranch) setMainBranchValue(res.mainBranch);
      })
      .catch((err: any) => { if (!cancelled) setLocalError(err?.message ?? "Failed to compute paths"); });
    onCleanup(() => { cancelled = true; });
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
        trimmed, branch, mainBranchValue().trim(), boardId(),
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
    pathValue, branchValue, mainBranchValue, boardId,
    submitting, localError, setLocalError,
    setPathValue, setBranchValue,
    setMainBranchValue: (v: string) => { setMainBranchTouched(true); setMainBranchValue(v); },
    setBoardId,
    handleBrowsePath,
    handleSubmit,
  };
}

export type AddProjectController = ReturnType<typeof createAddProjectController>;
