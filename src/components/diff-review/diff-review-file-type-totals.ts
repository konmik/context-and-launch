import type { ReviewFileSnapshot } from "~/core/diff-review/diff-review-types.js";

export interface FileTypeTotals {
	fileType: string;
	additions: number;
	deletions: number;
}

const NO_EXTENSION = "no ext";

export function fileTypeOf(filePath: string): string {
	const name = filePath.split("/").at(-1) ?? filePath;
	const dot = name.lastIndexOf(".");
	return dot > 0 ? `.${name.slice(dot + 1).toLowerCase()}` : NO_EXTENSION;
}

export function buildFileTypeTotals(
	files: readonly ReviewFileSnapshot[],
): FileTypeTotals[] {
	const totals = new Map<string, FileTypeTotals>();
	for (const file of files) {
		const fileType = fileTypeOf(file.path);
		const entry = totals.get(fileType) ?? { fileType, additions: 0, deletions: 0 };
		entry.additions += file.additions;
		entry.deletions += file.deletions;
		totals.set(fileType, entry);
	}
	return [...totals.values()].sort((left, right) =>
		right.additions + right.deletions - (left.additions + left.deletions)
		|| left.fileType.localeCompare(right.fileType));
}
