import { query } from "@solidjs/router";
import {
  configPaths, projectRegistry, projectPageService, worktreeManager,
  launcherConfigManager, fileWatcher, commandTemplateService,
} from "~/core/config/instances.js";
import { detectMainBranch } from "~/core/infra/git.js";
import { errorResult } from "~/core/shared/errors.js";

export type { BoardState, ProjectPageData, SyncStatus } from "~/core/board/board-types.js";

export const projectSyncRevalidateKeys = ["project-page", "project-sync-status", "sync-pending"];

export const getDefaultProjectSlug = query(async (): Promise<string | null> => {
  "use server";
  return projectRegistry.getDefaultProjectSlug();
}, "default-project-slug");

export const loadProjectPage = query(async (projectSlug: string) => {
  "use server";
  return projectPageService.loadProjectPage(projectSlug);
}, "project-page");

export const getSyncStatus = query(async (projectSlug: string) => {
  "use server";
  return projectPageService.loadSyncStatus(projectSlug);
}, "project-sync-status");

export async function recordProjectFocus(projectSlug: string) {
  "use server";
  projectRegistry.setLastUsed(projectSlug);
}

export const previewProjectPath = query(async (pathValue: string) => {
  "use server";
  const projectSlug = projectRegistry.previewSlug(pathValue);
  let mainBranch: string | undefined;
  try {
    mainBranch = await detectMainBranch(pathValue, commandTemplateService);
  } catch (err) {
    console.warn("detectMainBranch failed for preview:", err instanceof Error ? err.message : err);
  }
  return { projectSlug, mainBranch };
}, "preview-project-path");

export async function addProject(
  pathValue: string, branch: string, mainBranch: string, boardId: string, name: string,
) {
  "use server";
  try {
    const projectSlug = projectRegistry.previewSlug(pathValue);
    await worktreeManager.ensureWorktree(pathValue, projectSlug, branch || undefined);
    const project = projectRegistry.addProject(pathValue, {
      branch: branch || undefined,
      mainBranch: mainBranch?.trim() || undefined,
      boardId: boardId?.trim() || undefined,
      name: name?.trim() || undefined,
    });
    launcherConfigManager.saveWorktreeRootPath(
      project.projectSlug,
      configPaths.agentWorktreeDir(project.projectSlug),
    );
    return { ok: true as const, projectSlug: project.projectSlug };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteProject(projectSlug: string) {
  "use server";
  try {
    const exists = projectRegistry.listProjects().some((p) => p.projectSlug === projectSlug);
    if (!exists) {
      return { ok: false as const, type: "error" as const, message: `Project not found: ${projectSlug}` };
    }
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    projectRegistry.removeProject(projectSlug);
    fileWatcher.stop(worktreeDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function setProjectName(projectSlug: string, name: string) {
  "use server";
  try {
    projectRegistry.setName(projectSlug, name);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function setBoardId(projectSlug: string, boardId: string) {
  "use server";
  try {
    projectRegistry.setBoardId(projectSlug, boardId);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}
