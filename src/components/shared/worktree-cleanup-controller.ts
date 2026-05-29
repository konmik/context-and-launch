import { createSignal } from "solid-js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ErrorInfo } from "~/server/shared/errors.js";
import {
  type CleanupOptions, loadCleanupOptions, saveCleanupOptions, toErrorInfo,
} from "./worktree-cleanup-pure.js";

export interface WorktreeCleanupDeps {
  ticket: () => TicketInfo | null;
  action: () => "archive" | "delete";
  onSubmit: (
    folderName: string, cleanup: CleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  onOpenChange: (open: boolean) => void;
}

export function createWorktreeCleanupController(deps: WorktreeCleanupDeps) {
  const [submitting, setSubmitting] = createSignal(false);
  const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
  const [options, setOptions] = createSignal<CleanupOptions>(
    loadCleanupOptions(),
  );

  function updateOption(key: keyof CleanupOptions, value: boolean) {
    const updated = { ...options(), [key]: value };
    setOptions(updated);
    saveCleanupOptions(updated);
  }

  function close() {
    deps.onOpenChange(false);
    setErrorInfo(null);
  }

  const currentActionLabel = () => deps.action() === "archive" ? "Archive" : "Delete";

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const ticket = deps.ticket();
    if (!ticket) return;
    setSubmitting(true);
    setErrorInfo(null);
    try {
      const result = await deps.onSubmit(ticket.folderName, options());
      if (result?.error) setErrorInfo(toErrorInfo(result.error));
      else close();
    } catch (err: any) {
      setErrorInfo({ description: err?.message ?? "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting, errorInfo, options, actionLabel: currentActionLabel,
    updateOption, close, handleSubmit,
  };
}

export type WorktreeCleanupController = ReturnType<
  typeof createWorktreeCleanupController
>;
