import { createEffect, onCleanup } from "solid-js";
import { revalidate } from "@solidjs/router";
import { createNonSuspendingAsync } from "~/lib/create-non-suspending-async.js";
import { getWorktreeRevision } from "../ticket/ticket-api.js";

export const WORKTREE_REVISION_POLL_MS = 2000;

/**
 * The worktree is shared with agents and the user's own editors, and the server has no
 * channel to push their writes to a window. The watcher advances a revision instead, and
 * a view that must not go stale polls it for as long as it is open.
 */
export function createWorktreeRevision(projectSlug: () => string) {
  createEffect(() => {
    if (!projectSlug()) return;
    const timer = setInterval(
      () => void revalidate("worktree-revision"),
      WORKTREE_REVISION_POLL_MS,
    );
    onCleanup(() => clearInterval(timer));
  });

  return createNonSuspendingAsync(
    () => (projectSlug() ? getWorktreeRevision(projectSlug()) : Promise.resolve(0)),
    { initialValue: 0 },
  );
}
