import { describe, expect, it } from "vitest";
import { buildBinaryReviewFile, buildReviewFile } from "./diff-review-model.js";
import {
	fileIsReviewed,
	nextUnreviewedChange,
	unreviewedChangeCount,
} from "./review-navigation.js";

function twoHunkFile(path: string) {
	const context = Array.from({ length: 10 }, (_, index) => `keep ${index}`);
	return buildReviewFile({
		path,
		changeType: "modified",
		oldContents: ["top", ...context, "bottom", ""].join("\n"),
		newContents: ["top changed", ...context, "bottom changed", ""].join("\n"),
		byteSize: 64,
	});
}

function changedLineIds(file: ReturnType<typeof twoHunkFile>): string[] {
	return file.lines.filter((line) => line.type !== "context").map((line) => line.id);
}

describe("review navigation", () => {
	it("walks changed lines from the active file and wraps to earlier files", () => {
		const first = twoHunkFile("a.ts");
		const second = twoHunkFile("b.ts");
		const files = [first, second];
		expect(first.hunks).toHaveLength(2);

		const reviewed = new Set<string>();
		const visited: string[] = [];
		for (let step = 0; step < 8; step++) {
			const location = nextUnreviewedChange(files, reviewed, "b.ts");
			expect(location).toBeDefined();
			visited.push(`${location!.filePath}:${location!.side}:${location!.lineNumber}`);
			reviewed.add(location!.lineId);
		}

		expect(visited).toEqual([
			"b.ts:deletions:1",
			"b.ts:additions:1",
			"b.ts:deletions:12",
			"b.ts:additions:12",
			"a.ts:deletions:1",
			"a.ts:additions:1",
			"a.ts:deletions:12",
			"a.ts:additions:12",
		]);
		expect(nextUnreviewedChange(files, reviewed, "b.ts")).toBeUndefined();
		expect(unreviewedChangeCount(files, reviewed)).toBe(0);
	});

	it("skips binary files and counts hunks that still hold unreviewed lines", () => {
		const binary = buildBinaryReviewFile({
			path: "asset.bin",
			changeType: "added",
			byteSize: 4,
			contentIdentity: "A:0:4",
		});
		const text = twoHunkFile("a.ts");
		const firstHunkLines = text.lines
			.filter((line) => line.type !== "context" && line.hunkId === text.hunks[0].id)
			.map((line) => line.id);
		const reviewed = new Set(firstHunkLines);

		expect(unreviewedChangeCount([binary, text], reviewed)).toBe(1);
		expect(nextUnreviewedChange([binary, text], reviewed, "asset.bin")?.filePath)
			.toBe("a.ts");
		expect(fileIsReviewed(binary, new Set())).toBe(true);
		expect(fileIsReviewed(text, reviewed)).toBe(false);
		expect(fileIsReviewed(text, new Set(changedLineIds(text)))).toBe(true);
	});

	it("keeps line identity when other lines in the same hunk change", () => {
		const before = buildReviewFile({
			path: "a.ts",
			changeType: "added",
			oldContents: "",
			newContents: ["one", "two", "three", ""].join("\n"),
			byteSize: 16,
		});
		const after = buildReviewFile({
			path: "a.ts",
			changeType: "added",
			oldContents: "",
			newContents: ["one", "two changed", "three", ""].join("\n"),
			byteSize: 16,
		});
		const reviewed = new Set(changedLineIds(before));

		expect(before.hunks[0].id).not.toBe(after.hunks[0].id);
		expect(fileIsReviewed(after, reviewed)).toBe(false);
		const next = nextUnreviewedChange([after], reviewed, "a.ts");
		expect(next?.lineNumber).toBe(2);
		reviewed.add(next!.lineId);
		expect(fileIsReviewed(after, reviewed)).toBe(true);
	});
});
