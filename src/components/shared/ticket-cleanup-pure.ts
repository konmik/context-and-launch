import type { ErrorInfo } from "~/core/shared/errors.js";
import type {
  CleanupCheckItem, CleanupItemKey, TicketCleanupOptions,
} from "~/core/worktree/ticket-cleanup-checks.js";

export type { TicketCleanupOptions };

export type CleanupItemClientState = { state: "checking" } | CleanupCheckItem;
export type TicketCleanupItemStates = Record<CleanupItemKey, CleanupItemClientState>;

const cleanupItemKeys: CleanupItemKey[] = [
  "stopHerdrAgent", "deleteWorktree", "deleteLocalBranch", "deleteRemoteBranch",
];

export function toErrorInfo(value: string | ErrorInfo): ErrorInfo {
  return typeof value === "string" ? { description: value } : value;
}

export function allChecking(): TicketCleanupItemStates {
  return buildStates(() => ({ state: "checking" }));
}

export function allError(error: ErrorInfo): TicketCleanupItemStates {
  return buildStates(() => ({ state: "error", error }));
}

export function noCleanupOptions(): TicketCleanupOptions {
  return buildOptions(() => false);
}

export function singleCleanupOption(key: CleanupItemKey): TicketCleanupOptions {
  return buildOptions((candidate) => candidate === key);
}

function buildStates(make: () => CleanupItemClientState): TicketCleanupItemStates {
  const result = {} as TicketCleanupItemStates;
  for (const key of cleanupItemKeys) result[key] = make();
  return result;
}

function buildOptions(value: (key: CleanupItemKey) => boolean): TicketCleanupOptions {
  const result = {} as TicketCleanupOptions;
  for (const key of cleanupItemKeys) result[key] = value(key);
  return result;
}
