import type { ErrorInfo } from "~/core/shared/errors.js";

export interface CleanupOptions {
  deleteWorktree: boolean;
  deleteLocalBranch: boolean;
  deleteRemoteBranch: boolean;
}

const STORAGE_KEY = "worktree-cleanup-options";

export function loadCleanupOptions(): CleanupOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* invalid JSON or missing localStorage */ }
  return { deleteWorktree: true, deleteLocalBranch: true, deleteRemoteBranch: false };
}

export function saveCleanupOptions(options: CleanupOptions): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
}

export function toErrorInfo(value: string | ErrorInfo): ErrorInfo {
  return typeof value === "string" ? { description: value } : value;
}
