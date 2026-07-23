import fs from "fs";
import {
  commandTemplateService, launcherConfigManager, worktreeManager, projectRegistry,
} from "~/core/config/instances.js";
import { openInOs } from "~/core/infra/open-in-os.js";
import { openDirectoryDialog, openFileDialog } from "~/core/infra/native-file-dialog.js";
import { NotFoundError, errorMessage } from "~/core/shared/errors.js";

export async function openConfigDir(
  scope?: string, projectSlug?: string,
): Promise<void> {
  "use server";
  let dir: string;
  if (scope === "tickets" && projectSlug) dir = worktreeManager.getWorktreeDir(projectSlug);
  else if (scope === "project" && projectSlug) dir = launcherConfigManager.getProjectDir(projectSlug);
  else if (scope === "repo" && projectSlug) {
    const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug);
    if (!project) throw new NotFoundError(`Project not found: ${projectSlug}`);
    dir = project.path;
  }
  else dir = launcherConfigManager.getAppConfigDir();
  if (!fs.existsSync(dir)) throw new NotFoundError(`Directory does not exist: ${dir}`);
  await openInOs(dir, commandTemplateService);
}

export async function openNativeFileBrowser(
  startDir?: string,
): Promise<string[]> {
  "use server";
  return openFileDialog(startDir, commandTemplateService);
}

export async function pickDirectory(
	preselect: string,
): Promise<{ path: string } | { cancelled: true } | { error: string }> {
	"use server";
	return openDirectoryDialog(preselect, commandTemplateService);
}
