export interface ProjectInfo {
	path: string;
	slug: string;
	available: boolean;
}

export interface ProjectEntry {
	path: string;
	slug: string;
}

export interface ProjectConfig {
	projects: ProjectEntry[];
	lastUsedSlug: string | null;
}

export interface TicketInfo {
	number: string;
	title: string;
	status: string;
	folderName: string;
	stageNames: string[];
	useWorktree: boolean;
}

export interface BoardConfig {
	columns: string[];
}

export interface BoardState {
	columns: string[];
	tickets: TicketInfo[];
}

export interface CreateTicketRequest {
	number: string;
	title: string;
}

export interface UpdateTicketRequest {
	number?: string;
	title?: string;
	status?: string;
}

export interface StageMarkdownContent {
	content: string;
}

export interface LauncherTemplate {
	name: string;
	text: string;
}

export interface LauncherSkill {
	name: string;
	text: string;
}

export interface LauncherColumnDefaults {
	templateName: string | null;
	checkedSkills: string[];
}

export interface LauncherConfig {
	templates: LauncherTemplate[];
	skills: LauncherSkill[];
	columnDefaults?: Record<string, LauncherColumnDefaults>;
	worktreeRootPath?: string;
}

export interface MergedLauncherConfig {
	templates: (LauncherTemplate & { scope: "app" | "project" })[];
	skills: (LauncherSkill & { scope: "app" | "project" })[];
	columnDefaults: Record<string, LauncherColumnDefaults>;
	worktreeRootPath: string | null;
}
