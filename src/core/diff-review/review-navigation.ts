import type {
	ReviewDiffLine,
	ReviewFileSnapshot,
	ReviewLineSide,
} from "./diff-review-types.js";

export interface ReviewChangeLocation {
	filePath: string;
	lineId: string;
	side: ReviewLineSide;
	lineNumber: number;
}

function locate(
	file: ReviewFileSnapshot,
	line: ReviewDiffLine,
): ReviewChangeLocation | undefined {
	if (line.type === "deletion") {
		if (line.oldLineNumber === undefined) return undefined;
		return {
			filePath: file.path,
			lineId: line.id,
			side: "deletions",
			lineNumber: line.oldLineNumber,
		};
	}
	if (line.newLineNumber === undefined) return undefined;
	return {
		filePath: file.path,
		lineId: line.id,
		side: "additions",
		lineNumber: line.newLineNumber,
	};
}

export function unreviewedChangeCount(
	files: readonly ReviewFileSnapshot[],
	reviewedLineIds: ReadonlySet<string>,
): number {
	const unreviewedHunks = new Set<string>();
	for (const file of files) {
		if (file.binary) continue;
		for (const line of file.lines) {
			if (line.type === "context" || reviewedLineIds.has(line.id)) continue;
			unreviewedHunks.add(`${file.path}\0${line.hunkId}`);
		}
	}
	return unreviewedHunks.size;
}

export function fileIsReviewed(
	file: ReviewFileSnapshot,
	reviewedLineIds: ReadonlySet<string>,
): boolean {
	if (file.binary) return true;
	return file.lines.every((line) =>
		line.type === "context" || reviewedLineIds.has(line.id));
}

export function nextUnreviewedChange(
	files: readonly ReviewFileSnapshot[],
	reviewedLineIds: ReadonlySet<string>,
	activePath: string,
): ReviewChangeLocation | undefined {
	if (files.length === 0) return undefined;
	const activeIndex = files.findIndex((file) => file.path === activePath);
	const startIndex = activeIndex < 0 ? 0 : activeIndex;
	for (let offset = 0; offset < files.length; offset++) {
		const file = files[(startIndex + offset) % files.length];
		if (file.binary) continue;
		for (const line of file.lines) {
			if (line.type === "context" || reviewedLineIds.has(line.id)) continue;
			const location = locate(file, line);
			if (location) return location;
		}
	}
	return undefined;
}
