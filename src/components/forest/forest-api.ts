import { action, query } from "@solidjs/router";
import { respond } from "@solidjs/web";
import { worktreeManager, projectRegistry, boardConfigManager } from "~/core/config/instances.js";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { errorResult } from "~/core/shared/errors.js";
import { resolveInitialTicketStatus } from "~/core/board/initial-ticket-status.js";
import type { ForestLayout } from "~/core/ticket/forest-layout-store.js";

export const getForestLayout = query(async (projectSlug: string): Promise<ForestLayout> => {
  "use server";
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  return new TicketStore(worktreeDir).readForestLayoutStore().read();
}, "forest-layout");

const actionResult = <T>(value: T) => respond(value, { revalidate: [] });

export const saveForestPositions = action(async function saveForestPositions(
  input: { projectSlug: string; positions: ForestLayout },
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug);
    new TicketStore(worktreeDir).readForestLayoutStore().savePositions(input.positions);
    return actionResult({ ok: true as const });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "save-forest-positions");

export const addDependency = action(async function addDependency(
  input: { projectSlug: string; folderName: string; dependencyNumber: string },
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug);
    new TicketStore(worktreeDir).addDependency(input.folderName, input.dependencyNumber);
    return actionResult({ ok: true as const });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "add-forest-dependency");

export const removeDependency = action(async function removeDependency(
  input: { projectSlug: string; folderName: string; dependencyNumber: string },
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug);
    new TicketStore(worktreeDir).removeDependency(input.folderName, input.dependencyNumber);
    return actionResult({ ok: true as const });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "remove-forest-dependency");

export const createGroupTicket = action(async function createGroupTicket(input: {
  projectSlug: string;
  number: string;
  title: string;
  memberFolderNames: string[];
  parentGroupNumber: string | null;
  position: { x: number; y: number } | null;
}) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug);
    const initialStatus = resolveInitialTicketStatus(input.projectSlug, { projectRegistry, boardConfigManager });
    const group = new TicketStore(worktreeDir).createGroup(
      input.number, input.title, initialStatus, input.memberFolderNames,
      input.parentGroupNumber ?? undefined, input.position ?? undefined,
    );
    return actionResult({ ok: true as const, folderName: group.folderName });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "create-forest-group");

export const ungroupTicket = action(async function ungroupTicket(
  input: { projectSlug: string; folderName: string },
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(input.projectSlug);
    new TicketStore(worktreeDir).ungroup(input.folderName);
    return actionResult({ ok: true as const });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "ungroup-forest-ticket");
