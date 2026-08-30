import type { ErrorInfo } from "~/core/shared/errors.js";
import type {
  CleanupCheckItem, CleanupItemKey, TicketCleanupOptions,
} from "~/core/worktree/ticket-cleanup-checks.js";

export type { TicketCleanupOptions };

export type CleanupItemClientState = { state: "checking" } | CleanupCheckItem;
export type TicketCleanupItemStates = Record<CleanupItemKey, CleanupItemClientState>;

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

function buildStates(make: () => CleanupItemClientState) {
  return {
    stopHerdrAgent: make(),
    deleteWorktree: make(),
    deleteLocalBranch: make(),
    deleteRemoteBranch: make(),
  } satisfies TicketCleanupItemStates;
}

function buildOptions(value: (key: CleanupItemKey) => boolean): TicketCleanupOptions {
  return {
    stopHerdrAgent: value("stopHerdrAgent"),
    deleteWorktree: value("deleteWorktree"),
    deleteLocalBranch: value("deleteLocalBranch"),
    deleteRemoteBranch: value("deleteRemoteBranch"),
  } satisfies TicketCleanupOptions;
}
