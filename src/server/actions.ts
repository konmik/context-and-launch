import { query } from "@solidjs/router";
import type { ProjectInfo } from "~/server/project-registry.js";
import type { ColumnDefinition } from "~/server/board-config.js";
import type { TicketInfo } from "~/server/ticket-store.js";
import type { TicketOrder } from "~/server/ticket-order.js";

export interface BoardState {
  columns: ColumnDefinition[];
  tickets: TicketInfo[];
  ticketOrder: TicketOrder;
}

interface BoardPageData {
  projects: ProjectInfo[];
  slug: string;
  board: BoardState | null;
  projectUnavailable: boolean;
  projectNotFound: boolean;
  projectPath: string;
  suggestedNextNumber: string | null;
  hasRemote: boolean;
  hasConflict: boolean;
  error?: string;
}

export const getDefaultSlug = query(async (): Promise<string | null> => {
  "use server";
  const { projectRegistry } = await import("~/server/instances.js");
  return projectRegistry.getDefaultSlug();
}, "default-slug");

export const loadBoard = query(async (slug: string): Promise<BoardPageData> => {
  "use server";
  const { projectRegistry, boardConfigManager, worktreeManager, fileWatcher, launcherConfigManager, ticketSyncManager } =
    await import("~/server/instances.js");
  const { TicketStore } = await import("~/server/ticket-store.js");
  const { errorMessage } = await import("~/server/errors.js");

  projectRegistry.setLastUsed(slug);
  const projects = projectRegistry.listProjects();
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    return {
      projects,
      slug,
      board: null,
      projectUnavailable: false,
      projectNotFound: true,
      projectPath: "",
      suggestedNextNumber: null,
      hasRemote: false,
      hasConflict: false,
    };
  }
  if (!project.available) {
    return {
      projects,
      slug,
      board: null,
      projectUnavailable: true,
      projectNotFound: false,
      projectPath: project.path,
      suggestedNextNumber: null,
      hasRemote: false,
      hasConflict: false,
    };
  }

  try {
    const worktreeDir = await worktreeManager.ensureWorktree(project.path, slug);
    fileWatcher.stopAll();
    fileWatcher.watch(worktreeDir);
    const merged = launcherConfigManager.getMergedConfig(slug);
    const config = boardConfigManager.getConfig(merged.boardId);
    const store = new TicketStore(worktreeDir);
    const { tickets, ticketOrder } = store.loadBoardState(config.columns.map(c => c.name));
    const suggestedNextNumber = store.suggestNextNumber();
    const hasRemote = await ticketSyncManager.hasRemote(worktreeDir);
    const hasConflict = ticketSyncManager.hasActiveRebase(worktreeDir);
    return {
      projects,
      slug,
      board: { columns: config.columns, tickets, ticketOrder },
      projectUnavailable: false,
      projectNotFound: false,
      projectPath: project.path,
      suggestedNextNumber,
      hasRemote,
      hasConflict,
    };
  } catch (e) {
    return {
      projects,
      slug,
      board: null,
      projectUnavailable: false,
      projectNotFound: false,
      projectPath: project.path,
      suggestedNextNumber: null,
      hasRemote: false,
      hasConflict: false,
      error: errorMessage(e),
    };
  }
}, "board-data");

export async function addProjectAction(pathValue: string) {
  "use server";
  const { projectRegistry } = await import("~/server/instances.js");
  const { errorMessage } = await import("~/server/errors.js");
  try {
    const project = projectRegistry.addProject(pathValue);
    return { slug: project.slug };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function createTicketAction(slug: string, number: string, title: string) {
  "use server";
  const { worktreeManager, boardConfigManager, launcherConfigManager } = await import(
    "~/server/instances.js"
  );
  const { TicketStore } = await import("~/server/ticket-store.js");
  const { errorMessage } = await import("~/server/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const merged = launcherConfigManager.getMergedConfig(slug);
    const firstColumn = boardConfigManager.getConfig(merged.boardId).columns[0]?.name;
    new TicketStore(worktreeDir).createTicket(number, title, firstColumn);
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function updateTicketAction(
  slug: string,
  folderName: string,
  number: string | null,
  title: string | null,
  status: string | null
) {
  "use server";
  const { worktreeManager } = await import("~/server/instances.js");
  const { TicketStore } = await import("~/server/ticket-store.js");
  const { errorMessage } = await import("~/server/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).updateTicket(
      folderName,
      number,
      title,
      status
    );
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function archiveTicketAction(slug: string, folderName: string) {
  "use server";
  const { worktreeManager } = await import("~/server/instances.js");
  const { TicketStore } = await import("~/server/ticket-store.js");
  const { errorMessage } = await import("~/server/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).archiveTicket(folderName);
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteTicketAction(slug: string, folderName: string) {
  "use server";
  const { worktreeManager } = await import("~/server/instances.js");
  const { TicketStore } = await import("~/server/ticket-store.js");
  const { errorMessage } = await import("~/server/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).deleteTicket(folderName);
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function worktreeCleanupAction(
  slug: string,
  folderName: string,
  options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean }
) {
  "use server";
  const { launcherConfigManager, agentWorktreeManager, projectRegistry } = await import(
    "~/server/instances.js"
  );
  const { WorktreeCleanupService } = await import("~/server/worktree-cleanup.js");
  const { errorPayload } = await import("~/server/errors.js");
  try {
    const merged = launcherConfigManager.getMergedConfig(slug);
    if (!merged.worktreeRootPath) {
      return { error: { description: "Worktree root path is not configured" } };
    }
    const worktreePath = `${merged.worktreeRootPath}/${folderName}`;
    const projects = projectRegistry.listProjects();
    const project = projects.find((p) => p.slug === slug);
    if (!project) {
      return { error: { description: "Project not found" } };
    }
    const service = new WorktreeCleanupService(agentWorktreeManager);
    await service.cleanup(project.path, folderName, worktreePath, options);
    return { success: true };
  } catch (e) {
    return { error: errorPayload(e) };
  }
}
