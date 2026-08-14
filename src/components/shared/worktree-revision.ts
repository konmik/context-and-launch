import { createEffect, createMemo } from "solid-js";
import { revalidate } from "@solidjs/router";
import { getWorktreeRevision } from "../ticket/ticket-api.js";

export const WORKTREE_REVISION_POLL_MS = 2000;

export function createWorktreeRevision(projectSlug: () => string) {
  createEffect(projectSlug, (slug) => {
    if (!slug) return;
    const timer = setInterval(
      () => void revalidate("worktree-revision"),
      WORKTREE_REVISION_POLL_MS,
    );
    return () => clearInterval(timer);
  });

  return createMemo(
    () => (projectSlug() ? getWorktreeRevision(projectSlug()) : Promise.resolve(0)),
    { loadingValue: 0 },
  );
}
