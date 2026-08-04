import type { ReviewFileSnapshot } from "./diff-review-types.js";

export function reuseUnchangedFiles(
	previous: readonly ReviewFileSnapshot[],
	next: readonly ReviewFileSnapshot[],
): ReviewFileSnapshot[] {
	const byPath = new Map(previous.map((file) => [file.path, file]));
	return next.map((file) => {
		const existing = byPath.get(file.path);
		return existing?.contentHash === file.contentHash ? existing : file;
	});
}
