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
	port?: number;
	browser?: string;
}

export interface TicketInfo {
	number: string;
	title: string;
	status: string;
	folderName: string;
	stageNames: string[];
	useWorktree: boolean;
	fileNames: string[];
	references: { path: string; exists: boolean }[];
}

export interface ColumnDefinition {
	name: string;
	description?: string;
}

export interface BoardDefinition {
	id: string;
	name: string;
	columns: ColumnDefinition[];
}

export interface BoardConfig {
	columns: ColumnDefinition[];
}

export type TicketOrder = Record<string, string[]>;

export interface BoardState {
	columns: ColumnDefinition[];
	tickets: TicketInfo[];
	ticketOrder: TicketOrder;
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
	// Fractional sort key. Skills are shown sorted by `order` ascending across the
	// merged user+project list; dragging sets the moved skill to the midpoint of
	// its neighbours so only that one skill needs rewriting. Optional for legacy
	// configs and freshly added skills (see getMergedConfig for the fallback).
	order?: number;
}

export interface LauncherProfile {
	name: string;
	command: string;
}

export interface LauncherShortcut {
	name: string;
	command: string;
}

export interface LauncherColumnDefaults {
	templateName: string | null;
	checkedSkills: string[];
	profileName: string | null;
	lastLayer?: "editor" | "launcher" | "shortcuts";
	// Per-column display-order override: an explicit list of skill names for this
	// column's launcher. Distinct from the global fractional `order` on
	// LauncherSkill (which orders the merged list everywhere) -- this lets one
	// status reorder its skills without affecting other columns. Applied via
	// orderByNameList; names that no longer exist fall back to the global order.
	skillOrder?: string[];
}

export interface LauncherConfig {
	templates: LauncherTemplate[];
	skills: LauncherSkill[];
	profiles?: LauncherProfile[];
	shortcuts?: LauncherShortcut[];
	columnDefaults?: Record<string, LauncherColumnDefaults>;
	worktreeRootPath?: string;
	boardId?: string;
	conflictResolutionPrompt?: string;
}

export interface ErrorInfo {
	description: string;
	command?: string;
	output?: string;
}

export interface MergedLauncherConfig {
	templates: (LauncherTemplate & { scope: "app" | "project" })[];
	skills: (LauncherSkill & { scope: "app" | "project"; order: number })[];
	profiles: (LauncherProfile & { scope: "app" | "project" })[];
	shortcuts: (LauncherShortcut & { scope: "app" | "project" })[];
	columnDefaults: Record<string, LauncherColumnDefaults>;
	worktreeRootPath: string | null;
	boardId: string | null;
	conflictResolutionPrompt: string;
}
