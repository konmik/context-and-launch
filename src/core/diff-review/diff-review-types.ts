export type DiffScope = "all" | "branch" | "working" | "last-commit";
export type ReviewPace = "live" | "step-by-step";
export type DiffLayout = "split" | "unified";
export type DiffLineOverflow = "scroll" | "wrap";
export type ReviewLineSide = "deletions" | "additions";

export interface ReviewLineRange {
	start: number;
	side?: ReviewLineSide;
	end: number;
	endSide?: ReviewLineSide;
}

export type ReviewDiffLineType = "context" | "addition" | "deletion";

export interface ReviewDiffLine {
	id: string;
	hunkId: string;
	type: ReviewDiffLineType;
	text: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

export interface ReviewHunk {
	id: string;
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
}

export type ReviewFileChangeType =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "copied"
	| "type-changed";

export interface ReviewFileSnapshot {
	path: string;
	previousPath?: string;
	changeType: ReviewFileChangeType;
	additions: number;
	deletions: number;
	binary: boolean;
	byteSize: number;
	contentHash: string;
	oldContents?: string;
	newContents?: string;
	hunks: ReviewHunk[];
	lines: ReviewDiffLine[];
}

export interface ReviewSnapshot {
	scope: DiffScope;
	capturedAt: string;
	revision: string;
	worktreeIdentity: string;
	files: ReviewFileSnapshot[];
	reviewedLineIds: string[];
}

export interface ReviewPromptLine {
	type: ReviewDiffLineType;
	text: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

export interface ReviewPromptRange {
	start: number;
	end: number;
}

export interface ReviewPromptSnapshot {
	scope: DiffScope;
	filePath: string;
	oldRange?: ReviewPromptRange;
	newRange?: ReviewPromptRange;
	selectedLines: ReviewPromptLine[];
	contextBefore: ReviewPromptLine[];
	contextAfter: ReviewPromptLine[];
	selectionFingerprint: string;
	sourceRevision: string;
}

interface ReviewPromptQueueItemBase {
	id: string;
	createdAt: string;
	feedback: string;
	snapshot?: ReviewPromptSnapshot;
}

export type ReviewPromptQueueItem = ReviewPromptQueueItemBase & (
	| { state: "waiting" }
	| { state: "delivering"; deliveryStartedAt: string }
	| { state: "sent"; sentAt: string }
	| { state: "error"; error: string }
	| { state: "uncertain"; error: string }
);

export interface ReviewPromptQueue {
	items: ReviewPromptQueueItem[];
	cooldownUntil?: string;
	agentLaunchReservedUntil?: string;
	requestedAgentProfileName?: string;
}

export interface DiffReviewTicketState {
	worktreeIdentity: string;
	reviewedLines: Record<string, { path: string; reviewedAt: string }>;
	queue: ReviewPromptQueue;
}

export interface DiffReviewProjectState {
	version: 2;
	tickets: Record<string, DiffReviewTicketState>;
}
