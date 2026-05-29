import { query } from "@solidjs/router";
import type { ProjectInfo } from "~/server/project/project-registry.js";
import type { ColumnDefinition } from "~/server/project/board-config.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { TicketOrder } from "~/server/ticket/ticket-order.js";

export interface BoardState {
  columns: ColumnDefinition[];
  tickets: TicketInfo[];
  ticketOrder: TicketOrder;
}

interface BoardPageData {
  projects: ProjectInfo[];
  projectSlug: string;
  board: BoardState | null;
  projectUnavailable: boolean;
  projectNotFound: boolean;
  projectPath: string;
  suggestedNextNumber: string | null;
  hasRemote: boolean;
  hasConflict: boolean;
  error?: string;
}

export const getDefaultProjectSlug = query(async (): Promise<string | null> => {
  "use server";
  const { projectRegistry } = await import("~/server/config/instances.js");
  return projectRegistry.getDefaultProjectSlug();
}, "default-project-slug");

export const loadBoard = query(async (projectSlug: string): Promise<BoardPageData> => {
  "use server";
  const {
    projectRegistry, boardConfigManager, worktreeManager,
    fileWatcher, launcherConfigManager, ticketSyncManager,
  } = await import("~/server/config/instances.js");
  const { TicketStore } = await import("~/server/ticket/ticket-store.js");
  const { errorMessage } = await import("~/server/shared/errors.js");

  projectRegistry.setLastUsed(projectSlug);
  const projects = projectRegistry.listProjects();
  const project = projects.find((p) => p.projectSlug === projectSlug);

  if (!project) {
    return {
      projects,
      projectSlug,
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
      projectSlug,
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
    const worktreeDir = await worktreeManager.ensureWorktree(project.path, projectSlug, project.branch);
    fileWatcher.stopAll();
    fileWatcher.watch(worktreeDir);
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    const config = boardConfigManager.getConfig(merged.boardId);
    const store = new TicketStore(worktreeDir);
    const { tickets, ticketOrder } = store.loadBoardState(config.columns.map(c => c.name));
    const suggestedNextNumber = store.suggestNextNumber();
    const hasRemote = await ticketSyncManager.hasRemote(worktreeDir);
    const hasConflict = ticketSyncManager.hasActiveRebase(worktreeDir);
    return {
      projects,
      projectSlug,
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
      projectSlug,
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

export async function addProjectAction(
  pathValue: string, branch?: string, worktreeRootPath?: string, ticketsPath?: string,
) {
  "use server";
  const { projectRegistry, launcherConfigManager } = await import("~/server/config/instances.js");
  const { errorMessage } = await import("~/server/shared/errors.js");
  const fs = await import("node:fs");
  try {
    const project = projectRegistry.addProject(pathValue, undefined, branch, ticketsPath?.trim() || undefined);
    const trimmedRoot = worktreeRootPath?.trim();
    if (trimmedRoot) {
      fs.mkdirSync(trimmedRoot, { recursive: true });
      launcherConfigManager.saveWorktreeRootPath(project.projectSlug, trimmedRoot);
    }
    return { projectSlug: project.projectSlug };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function previewProjectPaths(pathValue: string) {
  "use server";
  const { projectRegistry, configPaths } = await import("~/server/config/instances.js");
  const { generateProjectSlug } = await import("~/server/project/project-registry.js");
  const existing = new Set(projectRegistry.listProjects().map((p) => p.projectSlug));
  const projectSlug = generateProjectSlug(pathValue, existing);
  return {
    projectSlug,
    ticketsPath: configPaths.ticketWorktreeDir(projectSlug),
    defaultWorktreesPath: configPaths.agentWorktreeDir(projectSlug),
  };
}

export async function createTicketAction(projectSlug: string, number: string, title: string) {
  "use server";
  const { worktreeManager, boardConfigManager, launcherConfigManager } = await import(
    "~/server/config/instances.js"
  );
  const { TicketStore } = await import("~/server/ticket/ticket-store.js");
  const { errorMessage } = await import("~/server/shared/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    const firstColumn = boardConfigManager.getConfig(merged.boardId).columns[0]?.name;
    new TicketStore(worktreeDir).createTicket(number, title, firstColumn);
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function updateTicketAction(
  projectSlug: string,
  folderName: string,
  number: string | null,
  title: string | null,
  status: string | null
) {
  "use server";
  const { worktreeManager } = await import("~/server/config/instances.js");
  const { TicketStore } = await import("~/server/ticket/ticket-store.js");
  const { errorMessage } = await import("~/server/shared/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
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

export async function archiveTicketAction(projectSlug: string, folderName: string) {
  "use server";
  const { worktreeManager } = await import("~/server/config/instances.js");
  const { TicketStore } = await import("~/server/ticket/ticket-store.js");
  const { errorMessage } = await import("~/server/shared/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).archiveTicket(folderName);
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteTicketAction(projectSlug: string, folderName: string) {
  "use server";
  const { worktreeManager } = await import("~/server/config/instances.js");
  const { TicketStore } = await import("~/server/ticket/ticket-store.js");
  const { errorMessage } = await import("~/server/shared/errors.js");
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    new TicketStore(worktreeDir).deleteTicket(folderName);
    return { success: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function worktreeCleanupAction(
  projectSlug: string,
  folderName: string,
  options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean }
) {
  "use server";
  const { launcherConfigManager, agentWorktreeManager, projectRegistry } = await import(
    "~/server/config/instances.js"
  );
  const { WorktreeCleanupService } = await import("~/server/worktree/worktree-cleanup.js");
  const { errorPayload } = await import("~/server/shared/errors.js");
  try {
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    if (!merged.worktreeRootPath) {
      return { error: { description: "Worktree root path is not configured" } };
    }
    const worktreePath = `${merged.worktreeRootPath}/${folderName}`;
    const projects = projectRegistry.listProjects();
    const project = projects.find((p) => p.projectSlug === projectSlug);
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
