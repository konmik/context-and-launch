import { query } from "@solidjs/router";
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

export async function saveForestPositions(projectSlug: string, positions: ForestLayout) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).readForestLayoutStore().savePositions(positions);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function addDependency(projectSlug: string, folderName: string, dependencyNumber: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).addDependency(folderName, dependencyNumber);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function removeDependency(projectSlug: string, folderName: string, dependencyNumber: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).removeDependency(folderName, dependencyNumber);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function createGroupTicket(
  projectSlug: string,
  number: string,
  title: string,
  memberFolderNames: string[],
  parentGroupNumber?: string,
  position?: { x: number; y: number },
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const initialStatus = resolveInitialTicketStatus(projectSlug, { projectRegistry, boardConfigManager });
    const group = new TicketStore(worktreeDir).createGroup(
      number, title, initialStatus, memberFolderNames, parentGroupNumber, position,
    );
    return { ok: true as const, folderName: group.folderName };
  } catch (e) {
    return errorResult(e);
  }
}

export async function ungroupTicket(projectSlug: string, folderName: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).ungroup(folderName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}
