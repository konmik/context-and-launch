import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

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
