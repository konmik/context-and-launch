import type {
	ReviewPromptLine,
	ReviewPromptRange,
	ReviewPromptSnapshot,
} from "./diff-review-types.js";

export interface ReviewPromptContent {
	feedback: string;
	snapshot?: ReviewPromptSnapshot;
}

export interface ReviewPromptFreshness {
	stale: boolean;
	verificationError?: string;
}

function promptLineText(line: ReviewPromptLine): string {
	const prefix = line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " ";
	const oldNumber = line.oldLineNumber?.toString() ?? "-";
	const newNumber = line.newLineNumber?.toString() ?? "-";
	return `${prefix} ${oldNumber.padStart(5)} ${newNumber.padStart(5)} | ${line.text}`;
}

function rangeText(range: ReviewPromptRange | undefined): string {
	if (!range) return "none";
	return range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`;
}

export function renderReviewPrompt(
	prompt: ReviewPromptContent,
	freshness: ReviewPromptFreshness,
): string {
	const snapshot = prompt.snapshot;
	if (!snapshot) return prompt.feedback;
	const lines = [
		"Review Prompt",
		`File: ${snapshot.filePath}`,
		`Old lines: ${rangeText(snapshot.oldRange)}`,
		`New lines: ${rangeText(snapshot.newRange)}`,
	];
	if (prompt.feedback.trim()) {
		lines.push("", "Feedback:", prompt.feedback);
	}
	lines.push("", "Selected diff:", ...snapshot.selectedLines.map(promptLineText));
	if (snapshot.contextBefore.length > 0) {
		lines.push("", "Context before:", ...snapshot.contextBefore.map(promptLineText));
	}
	if (snapshot.contextAfter.length > 0) {
		lines.push("", "Context after:", ...snapshot.contextAfter.map(promptLineText));
	}
	if (freshness.stale) {
		lines.push(
			"",
			"STALE CONTEXT: The selected code changed after this snapshot was captured."
				+ " Use the original snapshot above as the review reference.",
		);
	}
	if (freshness.verificationError) {
		lines.push("", `CONTEXT CHECK UNAVAILABLE: ${freshness.verificationError}`);
	}
	return lines.join("\n");
}
