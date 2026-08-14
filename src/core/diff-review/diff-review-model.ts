import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs";
import type {
	ReviewDiffLine,
	ReviewFileChangeType,
	ReviewFileSnapshot,
	ReviewHunk,
	ReviewLineRange,
	ReviewLineSide,
	ReviewPromptLine,
	ReviewPromptSnapshot,
} from "./diff-review-types.js";

function stableHash(value: string): string {
	let first = 0x811c9dc5;
	let second = 0x9e3779b9;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		first = Math.imul(first ^ code, 0x01000193);
		second = Math.imul(second ^ code, 0x85ebca6b);
	}
	return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function reviewContentHash(oldContents: string, newContents: string): string {
	return stableHash(`${oldContents.length}:${oldContents}\0${newContents.length}:${newContents}`);
}

function lineSignature(type: ReviewDiffLine["type"], text: string): string {
	return `${type}:${text}`;
}

// Git stores text with LF endings and normalizes CRLF at the index boundary,
// while the working file on disk may carry the platform's own endings. The two
// sides of a Diff Review reach the model through different pipelines, so line
// endings must be normalized here or a CRLF-versus-LF file reads as a change to
// every line. A stray carriage return never belongs to the line's text.
function normalizeLineEndings(value: string): string {
	return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hunkFingerprint(
	filePath: string,
	lines: Omit<ReviewDiffLine, "id" | "hunkId">[],
	ordinal: number,
): string {
	const changed = lines.filter((line) => line.type !== "context");
	const leading = lines.slice(0, 3);
	const trailing = lines.slice(-3);
	const material = [...leading, ...changed, ...trailing]
		.map((line) => `${line.type}:${line.text}`)
		.join("\n");
	return `h-${stableHash(`${filePath}\0${material}`)}-${ordinal}`;
}

function rawLinesForHunk(
	diff: FileDiffMetadata,
	hunkIndex: number,
): Omit<ReviewDiffLine, "id" | "hunkId">[] {
	const hunk = diff.hunks[hunkIndex];
	const lines: Omit<ReviewDiffLine, "id" | "hunkId">[] = [];
	const displayedText = (value: string | undefined) => (value ?? "").replace(/\r?\n$/, "");
	for (const content of hunk.hunkContent) {
		if (content.type === "context") {
			for (let offset = 0; offset < content.lines; offset++) {
				lines.push({
					type: "context",
					text: displayedText(diff.additionLines[content.additionLineIndex + offset]),
					oldLineNumber: content.deletionLineIndex + offset + 1,
					newLineNumber: content.additionLineIndex + offset + 1,
				});
			}
			continue;
		}
		for (let offset = 0; offset < content.deletions; offset++) {
			lines.push({
				type: "deletion",
				text: displayedText(diff.deletionLines[content.deletionLineIndex + offset]),
				oldLineNumber: content.deletionLineIndex + offset + 1,
			});
		}
		for (let offset = 0; offset < content.additions; offset++) {
			lines.push({
				type: "addition",
				text: displayedText(diff.additionLines[content.additionLineIndex + offset]),
				newLineNumber: content.additionLineIndex + offset + 1,
			});
		}
	}
	return lines;
}

export interface BuildReviewFileInput {
	path: string;
	previousPath?: string;
	changeType: ReviewFileChangeType;
	oldContents: string;
	newContents: string;
	byteSize: number;
}

export function buildReviewFile(input: BuildReviewFileInput): ReviewFileSnapshot {
	const oldContents = normalizeLineEndings(input.oldContents);
	const newContents = normalizeLineEndings(input.newContents);
	const contentHash = reviewContentHash(oldContents, newContents);
	if (oldContents === newContents) {
		return {
			path: input.path,
			previousPath: input.previousPath,
			changeType: input.changeType,
			additions: 0,
			deletions: 0,
			binary: false,
			byteSize: input.byteSize,
			contentHash,
			oldContents,
			newContents,
			hunks: [],
			lines: [],
		};
	}

	const diff = parseDiffFromFile(
		{
			name: input.previousPath ?? input.path,
			contents: oldContents,
			cacheKey: `${contentHash}:old`,
		},
		{
			name: input.path,
			contents: newContents,
			cacheKey: `${contentHash}:new`,
		},
		{ context: 3 },
		true,
	);
	const hunks: ReviewHunk[] = [];
	const lines: ReviewDiffLine[] = [];
	let additions = 0;
	let deletions = 0;
	const fingerprintOccurrences = new Map<string, number>();
	const lineOccurrences = new Map<string, number>();
	const rawHunks = diff.hunks.map((_, index) => rawLinesForHunk(diff, index));
	const signatureCounts = new Map<string, number>();
	for (const rawLines of rawHunks) {
		for (const line of rawLines) {
			const signature = lineSignature(line.type, line.text);
			signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
		}
	}

	for (let hunkIndex = 0; hunkIndex < diff.hunks.length; hunkIndex++) {
		const sourceHunk = diff.hunks[hunkIndex];
		const rawLines = rawHunks[hunkIndex];
		const baseFingerprint = hunkFingerprint(input.path, rawLines, 0).replace(/-0$/, "");
		const occurrence = fingerprintOccurrences.get(baseFingerprint) ?? 0;
		fingerprintOccurrences.set(baseFingerprint, occurrence + 1);
		const hunkId = `${baseFingerprint}-${occurrence}`;

		for (const line of rawLines) {
			if (line.type === "addition") additions++;
			if (line.type === "deletion") deletions++;
			const signature = lineSignature(line.type, line.text);
			const lineOccurrence = lineOccurrences.get(signature) ?? 0;
			lineOccurrences.set(signature, lineOccurrence + 1);
			// Equal diff lines have no intrinsic identity. Tie ambiguous occurrences
			// to this revision so removing one cannot transfer reviewed state to another.
			const identity = signatureCounts.get(signature) === 1
				? `${input.path}\0${signature}`
				: `${input.path}\0${signature}\0${contentHash}`;
			lines.push({
				...line,
				id: `l-${stableHash(identity)}-${lineOccurrence}`,
				hunkId,
			});
		}

		hunks.push({
			id: hunkId,
			oldStart: sourceHunk.deletionStart,
			oldCount: sourceHunk.deletionCount,
			newStart: sourceHunk.additionStart,
			newCount: sourceHunk.additionCount,
		});
	}

	return {
		path: input.path,
		previousPath: input.previousPath,
		changeType: input.changeType,
		additions,
		deletions,
		binary: false,
		byteSize: input.byteSize,
		contentHash,
		oldContents,
		newContents,
		hunks,
		lines,
	};
}

export function buildBinaryReviewFile(input: {
	path: string;
	previousPath?: string;
	changeType: ReviewFileChangeType;
	byteSize: number;
	contentIdentity: string;
}): ReviewFileSnapshot {
	return {
		path: input.path,
		previousPath: input.previousPath,
		changeType: input.changeType,
		additions: 0,
		deletions: 0,
		binary: true,
		byteSize: input.byteSize,
		contentHash: stableHash(input.contentIdentity),
		hunks: [],
		lines: [],
	};
}

function pointMatches(
	line: ReviewDiffLine,
	lineNumber: number,
	side: ReviewLineSide | undefined,
): boolean {
	if (side === "deletions") return line.oldLineNumber === lineNumber;
	if (side === "additions") return line.newLineNumber === lineNumber;
	return line.newLineNumber === lineNumber || line.oldLineNumber === lineNumber;
}

function promptLine(line: ReviewDiffLine): ReviewPromptLine {
	return {
		type: line.type,
		text: line.text,
		oldLineNumber: line.oldLineNumber,
		newLineNumber: line.newLineNumber,
	};
}

function rangeFor(
	lines: ReviewDiffLine[],
	side: "oldLineNumber" | "newLineNumber",
): { start: number; end: number } | undefined {
	const numbers = lines
		.map((line) => line[side])
		.filter((value): value is number => value !== undefined);
	if (numbers.length === 0) return undefined;
	return { start: Math.min(...numbers), end: Math.max(...numbers) };
}

function selectionSignature(lines: Pick<ReviewPromptLine, "type" | "text">[]): string {
	return lines.map((line) => `${line.type}:${line.text}`).join("\n");
}

export function buildReviewPromptSnapshot(
	file: ReviewFileSnapshot,
	range: ReviewLineRange,
	scope: ReviewPromptSnapshot["scope"],
	sourceRevision: string,
): ReviewPromptSnapshot {
	if (file.binary) throw new Error("Binary files cannot be selected for review.");
	const startIndex = file.lines.findIndex((line) => pointMatches(line, range.start, range.side));
	const endIndex = file.lines.findIndex((line) =>
		pointMatches(line, range.end, range.endSide ?? range.side));
	if (startIndex < 0 || endIndex < 0) {
		throw new Error("The selected lines are no longer present in this diff.");
	}
	const first = Math.min(startIndex, endIndex);
	const last = Math.max(startIndex, endIndex);
	const selected = file.lines.slice(first, last + 1);
	if (selected.length === 0) throw new Error("Select at least one diff line.");
	const selectedLines = selected.map(promptLine);
	return {
		scope,
		filePath: file.path,
		oldRange: rangeFor(selected, "oldLineNumber"),
		newRange: rangeFor(selected, "newLineNumber"),
		selectedLines,
		contextBefore: file.lines.slice(Math.max(0, first - 3), first).map(promptLine),
		contextAfter: file.lines.slice(last + 1, last + 4).map(promptLine),
		selectionFingerprint: stableHash(selectionSignature(selectedLines)),
		sourceRevision,
	};
}

export function reviewSelectionStillExists(
	file: ReviewFileSnapshot | undefined,
	snapshot: ReviewPromptSnapshot,
): boolean {
	if (!file || file.binary) return false;
	const expected = selectionSignature(snapshot.selectedLines);
	const count = snapshot.selectedLines.length;
	for (let index = 0; index <= file.lines.length - count; index++) {
		if (selectionSignature(file.lines.slice(index, index + count)) !== expected) continue;
		const before = file.lines.slice(
			Math.max(0, index - snapshot.contextBefore.length),
			index,
		);
		const after = file.lines.slice(
			index + count,
			index + count + snapshot.contextAfter.length,
		);
		if (
			selectionSignature(before) === selectionSignature(snapshot.contextBefore)
			&& selectionSignature(after) === selectionSignature(snapshot.contextAfter)
		) return true;
	}
	return false;
}
