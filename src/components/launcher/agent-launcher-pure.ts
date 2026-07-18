import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import { worktreeFolderName } from "~/core/worktree/worktree-naming.js";

export function launchErrorInfo(
	result: { message: string; errorInfo?: ErrorInfo },
): ErrorInfo {
	return { ...(result.errorInfo ?? { description: result.message }), title: "Launch failed" };
}

export interface LauncherDefaults {
	templateName: string;
	profileName: string;
	checkedSkills: string[];
	skillOrder: string[];
}

export function resolveDefaults(
	config: MergedLauncherConfig | null,
	ticketStatus: string,
): LauncherDefaults {
	if (!config) return { templateName: "", profileName: "", checkedSkills: [], skillOrder: [] };
	const defaults = config.columnDefaults[ticketStatus];
	return {
		templateName: defaults?.templateName ?? config.templates[0]?.name ?? "",
		profileName: defaults?.profileName ?? config.profiles[0]?.name ?? "",
		checkedSkills: defaults?.checkedSkills ?? [],
		skillOrder: defaults?.skillOrder ?? [],
	};
}

export function computeLaunchDir(opts: {
	useWorktree: boolean;
	projectPath: string;
	worktreeRootPath: string | null;
	agentWorktreeDir: string;
	folderName: string;
	savedAgentWorktreeDir?: string;
}): string {
	if (!opts.useWorktree) return opts.projectPath;
	if (opts.savedAgentWorktreeDir) return opts.savedAgentWorktreeDir;
	const root = opts.worktreeRootPath || opts.agentWorktreeDir;
	return root.replace(/[\\/]+$/, "") + "/" + worktreeFolderName(opts.folderName);
}
