import { createSignal, createEffect, onCleanup } from "solid-js";
import { previewProjectPath } from "./project-api.js";
import { pickDirectory } from "../shared/shared-api.js";

export type AddProjectAction = (
  pathValue: string, branch: string, mainBranch: string, boardId: string,
  name: string,
) => Promise<{ ok: true; projectSlug: string } | { ok: false; type: string; message: string }>;

export interface AddProjectControllerDeps {
  action: AddProjectAction;
  onSuccess?: (projectSlug: string) => void;
  errorMessage?: string;
}

export function createAddProjectController(deps: AddProjectControllerDeps) {
  const [nameValue, setNameValue] = createSignal("");
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
    previewProjectPath(p)
      .then((res) => {
        if (!cancelled && !mainBranchTouched() && res.mainBranch) setMainBranchValue(res.mainBranch);
      })
      .catch((err: any) => { if (!cancelled) setLocalError(err?.message ?? "Failed to compute paths"); });
    onCleanup(() => { cancelled = true; });
  });

  async function handleBrowsePath() {
    try {
      const result = await pickDirectory(pathValue().trim());
      if ("path" in result) setPathValue(result.path);
      else if ("error" in result) setLocalError(result.error);
    } catch (err: any) {
      setLocalError(err?.message ?? "Failed to pick directory");
    }
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
        nameValue().trim(),
      );
      if (!result.ok) setLocalError(result.message);
      else deps.onSuccess?.(result.projectSlug);
    } catch (err: any) {
      setLocalError(err?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    nameValue, pathValue, branchValue, mainBranchValue, boardId,
    submitting, localError, setLocalError,
    setNameValue, setPathValue, setBranchValue,
    setMainBranchValue: (v: string) => { setMainBranchTouched(true); setMainBranchValue(v); },
    setBoardId,
    handleBrowsePath,
    handleSubmit,
  };
}

export type AddProjectController = ReturnType<typeof createAddProjectController>;
