import { createSignal, Show } from "solid-js";

interface AddProjectFormProps {
  action: (path: string) => Promise<{ slug?: string; error?: string }>;
  errorMessage?: string;
  onSuccess?: (slug: string) => void;
  submitTitle?: string;
}

export default function AddProjectForm(props: AddProjectFormProps) {
  const [pathValue, setPathValue] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [localError, setLocalError] = createSignal(props.errorMessage ?? "");

  const canBrowse = typeof globalThis.window !== "undefined" && "showDirectoryPicker" in globalThis.window;

  async function handleBrowse() {
    if (canBrowse) {
      try { const handle = await (globalThis.window as any).showDirectoryPicker(); setPathValue(handle.name); }
      catch { /* user cancelled */ }
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting()) return;
    const trimmed = pathValue().trim();
    if (!trimmed) return;
    setSubmitting(true); setLocalError("");
    try {
      const result = await props.action(trimmed);
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
          <Show when={canBrowse}>
            <button type="button" onClick={handleBrowse} class="btn-secondary">Browse</button>
          </Show>
        </div>
      </div>
      <Show when={localError()}><p class="mb-4 text-sm text-destructive">{localError()}</p></Show>
      <button type="submit" disabled={submitting() || !pathValue().trim()} title={props.submitTitle} class="btn-primary w-full">
        {submitting() ? "Adding..." : "Add Project"}
      </button>
    </form>
  );
}
