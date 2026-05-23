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
	sessionId?: string;
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

export interface AiStatusResponse {
	running: boolean;
	sessionId: string | null;
}

export interface AiSteerRequest {
	text: string;
}

export interface AiEvent {
	timestamp: number;
	seq: number;
	type: string;
	data: unknown;
	sessionId?: string;
}
