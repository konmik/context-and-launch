import { createEffect, onCleanup } from "solid-js";
import { revalidate } from "@solidjs/router";
import { createNonSuspendingAsync } from "~/lib/create-non-suspending-async.js";
import { getWorktreeRevision } from "../ticket/ticket-api.js";

export const WORKTREE_REVISION_POLL_MS = 2000;

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
