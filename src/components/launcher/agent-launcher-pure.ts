import type { ErrorInfo } from "~/server/shared/errors.js";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";

export interface LauncherDefaults {
	templateName: string;
	profileName: string;
	checkedSkills: string[];
	skillOrder: string[];
}

export type LaunchResult =
	| { type: "ok" }
	| { type: "behindRemote"; message: string }
	| { type: "dirtyWorktree"; message: string }
	| { type: "error"; errorInfo: ErrorInfo };

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

export function buildLaunchBody(
	templateName: string,
	checkedSkills: string[],
	useWorktree: boolean,
	profileName: string,
	extra?: Record<string, unknown>,
): Record<string, unknown> {
	return { templateName, checkedSkills, useWorktree, profileName, ...extra };
}

export function ticketAiUrl(projectSlug: string, folderName: string, action: string): string {
	return `/api/projects/${projectSlug}/board/tickets/${folderName}/ai/${action}`;
}

export function parseLaunchResponse(status: number, responseText: string): LaunchResult {
	if (status >= 200 && status < 300) return { type: "ok" };
	if (status === 409) {
		try {
			const data = JSON.parse(responseText);
			if (data.behindRemote) return { type: "behindRemote", message: data.message };
			if (data.dirtyWorktree) return { type: "dirtyWorktree", message: data.message };
		} catch { /* response is not JSON, fall through to error */ }
	}
	return { type: "error", errorInfo: textToErrorInfo(responseText, status) };
}

export function textToErrorInfo(text: string, status: number): ErrorInfo {
	try {
		const data = JSON.parse(text);
		if (data.description) return data as ErrorInfo;
		if (data.error) return { description: data.error };
		return { description: JSON.stringify(data) };
	} catch { /* not JSON, use raw text */ }
	return { description: text || `Error ${status}` };
}
