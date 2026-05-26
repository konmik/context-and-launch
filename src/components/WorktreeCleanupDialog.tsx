import { createSignal, Show, onMount } from "solid-js";
import { DialogRoot, DialogTitle, DialogDescription } from "./ui/dialog";
import type { TicketInfo, ErrorInfo } from "~/types.js";

const STORAGE_KEY = "worktree-cleanup-options";

interface CleanupOptions {
  deleteWorktree: boolean;
  deleteLocalBranch: boolean;
  deleteRemoteBranch: boolean;
}

interface WorktreeCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketInfo | null;
  action: "archive" | "delete";
  onSubmit: (folderName: string, cleanup: CleanupOptions) => Promise<{ error?: string | ErrorInfo }>;
}

function loadOptions(): CleanupOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { deleteWorktree: true, deleteLocalBranch: true, deleteRemoteBranch: false };
}

function saveOptions(options: CleanupOptions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
}

export default function WorktreeCleanupDialog(props: WorktreeCleanupDialogProps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
  const [options, setOptions] = createSignal<CleanupOptions>(loadOptions());

  onMount(() => setOptions(loadOptions()));

  function updateOption(key: keyof CleanupOptions, value: boolean) {
    const updated = { ...options(), [key]: value };
    setOptions(updated);
    saveOptions(updated);
  }

  function close() { props.onOpenChange(false); setErrorInfo(null); }

  function toErrorInfo(value: string | ErrorInfo): ErrorInfo {
    return typeof value === "string" ? { description: value } : value;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!props.ticket) return;
    setSubmitting(true);
    setErrorInfo(null);
    try {
      const result = await props.onSubmit(props.ticket.folderName, options());
      if (result?.error) setErrorInfo(toErrorInfo(result.error));
      else close();
    } catch (err: any) {
      setErrorInfo({ description: err?.message ?? "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }

  const actionLabel = () => props.action === "archive" ? "Archive" : "Delete";

  return (
    <DialogRoot open={props.open && !!props.ticket} onOpenChange={close}>
      <DialogTitle>{actionLabel()} Ticket</DialogTitle>
      <DialogDescription>{actionLabel()} ticket {props.ticket?.number} - {props.ticket?.title}?</DialogDescription>

      <div class="mb-4 space-y-2">
        <p class="text-sm font-medium">Worktree cleanup</p>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options().deleteWorktree} onChange={(e) => updateOption("deleteWorktree", e.currentTarget.checked)} />
          Delete worktree
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options().deleteLocalBranch} onChange={(e) => updateOption("deleteLocalBranch", e.currentTarget.checked)} />
          Delete local branch
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={options().deleteRemoteBranch} onChange={(e) => updateOption("deleteRemoteBranch", e.currentTarget.checked)} />
          Delete remote branch
        </label>
      </div>

      <Show when={errorInfo()}>
        {(err) => (
          <div class="mb-4 rounded-md bg-destructive/10 px-3 py-2">
            <p class="text-sm text-destructive">{err().description}</p>
            <Show when={err().command}><p class="mt-1 text-xs text-muted-foreground">Command: <code>{err().command}</code></p></Show>
            <Show when={err().output}><pre class="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">{err().output}</pre></Show>
          </div>
        )}
      </Show>

      <form onSubmit={handleSubmit}>
        <div class="flex justify-end gap-2">
          <button type="button" onClick={close} class="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting()} class={props.action === "delete" ? "btn-destructive" : "btn-primary"}>{actionLabel()}</button>
        </div>
      </form>
    </DialogRoot>
  );
}
