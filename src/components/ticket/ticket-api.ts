import {
  worktreeManager, boardConfigManager, projectRegistry,
  operationTracker, ticketSyncManager, syncPendingTracker,
  launcherConfigManager, agentWorktreeManager, fileWatcher,
} from "~/core/config/instances.js";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { WorktreeCleanupService } from "~/core/worktree/worktree-cleanup.js";
import { worktreeFolderName } from "~/core/worktree/worktree-naming.js";
import { ValidationError, NotFoundError, errorMessage, errorPayload, errorResult } from "~/core/shared/errors.js";
import type { ErrorInfo } from "~/core/shared/errors.js";

export async function createTicket(projectSlug: string, number: string, title: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const boardId = projectRegistry.getBoardId(projectSlug);
    const columns = boardConfigManager.getConfig(boardId).columns;
    if (columns.length === 0) {
      return { ok: false as const, type: "error" as const, message: "Board has no columns configured" };
    }
    new TicketStore(worktreeDir).createTicket(number, title, columns[0].name);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function updateTicket(
  projectSlug: string, folderName: string,
  number: string | null, title: string | null, status: string | null,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const store = new TicketStore(worktreeDir);
    const updated = store.updateTicket(folderName, number, title, status);
    return { ok: true as const, folderName: updated.folderName };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteTicket(projectSlug: string, folderName: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).deleteTicket(folderName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function archiveTicket(projectSlug: string, folderName: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).archiveTicket(folderName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function reorderTicket(
  projectSlug: string, folderName: string,
  fromColumn: string, toColumn: string, newIndex: number,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).moveTicket(folderName, fromColumn, toColumn, newIndex);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function getContext(
  projectSlug: string, folderName: string, contextFileName: string,
): Promise<{ content: string } | null> {
  "use server";
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  const store = new TicketStore(worktreeDir);
  const content = store.getTicketContext(folderName, contextFileName);
  if (content === null) return null;
  return { content };
}

export async function saveContext(
  projectSlug: string, folderName: string, contextFileName: string, content: string,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).saveTicketContext(folderName, contextFileName, content);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteContext(
  projectSlug: string, folderName: string, contextFileName: string,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).deleteTicketContext(folderName, contextFileName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteFile(
  projectSlug: string, folderName: string, fileName: string,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).deleteTicketFile(folderName, fileName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function uploadFile(
  projectSlug: string, folderName: string, formData: FormData,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const store = new TicketStore(worktreeDir);
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const [, value] of formData.entries()) {
      if (!(value instanceof File)) continue;
      const fileName = value.name;
      try {
        const arrayBuffer = await value.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        store.copyFileToTicket(folderName, fileName, buffer);
        results.push({ name: fileName, ok: true });
      } catch (e) {
        results.push({ name: fileName, ok: false, error: errorMessage(e) });
      }
    }
    return { ok: true as const, results };
  } catch (e) {
    return errorResult(e);
  }
}

export async function addReferences(
  projectSlug: string, folderName: string, paths: string[],
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const store = new TicketStore(worktreeDir);
    for (const p of paths) {
      store.addReference(folderName, p);
    }
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function removeReference(
  projectSlug: string, folderName: string, refPath: string,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).removeReference(folderName, refPath);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function setUseWorktree(
  projectSlug: string, folderName: string, useWorktree: boolean,
) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).setUseWorktree(folderName, useWorktree);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function syncTickets(projectSlug: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    fileWatcher.stop(worktreeDir);
    try {
      const result = await operationTracker.track(ticketSyncManager.sync(worktreeDir));
      syncPendingTracker.invalidate(worktreeDir);
      return { ok: true as const, ...result };
    } finally {
      fileWatcher.watch(worktreeDir);
    }
  } catch (e) {
    return errorResult(e);
  }
}

export async function getSyncPending(projectSlug: string): Promise<boolean> {
  "use server";
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  return syncPendingTracker.hasPendingChanges(worktreeDir);
}

export async function worktreeCleanup(
  projectSlug: string, folderName: string,
  options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean },
) {
  "use server";
  try {
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    if (!merged.worktreeRootPath) throw new ValidationError("Worktree root path is not configured");
    const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug);
    if (!project) throw new NotFoundError("Project not found");
    const worktreePath = `${merged.worktreeRootPath}/${worktreeFolderName(folderName)}`;
    await new WorktreeCleanupService(agentWorktreeManager).cleanup(
      project.path, folderName, worktreePath, options, project.mainBranch,
    );
    return { ok: true as const };
  } catch (e) {
    const payload = errorPayload(e);
    return {
      ok: false as const, type: "error" as const,
      message: payload.description, errorInfo: payload as ErrorInfo,
    };
  }
}
