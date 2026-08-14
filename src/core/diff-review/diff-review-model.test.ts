import { describe, expect, it } from "vitest";
import {
	buildBinaryReviewFile,
	buildReviewFile,
	buildReviewPromptSnapshot,
	reviewSelectionStillExists,
} from "./diff-review-model.js";

function numberedLines(count: number): string {
	return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}

describe("Diff Review model", () => {
	it("builds stable hunks and snapshots only the selection plus three context lines", () => {
		const before = numberedLines(20);
		const after = before
			.replace("line 5", "changed five")
			.replace("line 17", "changed seventeen");
		const file = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents: before,
			newContents: after,
			byteSize: Buffer.byteLength(after),
		});

		expect(file.hunks).toHaveLength(2);
		const selectedLine = file.lines.find((line) => line.text === "changed five");
		expect(selectedLine?.newLineNumber).toBe(5);
		const snapshot = buildReviewPromptSnapshot(
			file,
			{ start: 5, end: 5, side: "additions" },
			"working",
			"revision-1",
		);
		expect(snapshot.selectedLines.map((line) => line.text)).toEqual(["changed five"]);
		expect(snapshot.contextBefore.length).toBeLessThanOrEqual(3);
		expect(snapshot.contextAfter.length).toBeLessThanOrEqual(3);
		expect(snapshot.newRange).toEqual({ start: 5, end: 5 });
	});

	it("keeps a queued selection fresh when unrelated lines move it and marks changed content stale", () => {
		const original = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents: "a\nb\nc",
			newContents: "a\nselected\nc",
			byteSize: 12,
		});
		const snapshot = buildReviewPromptSnapshot(
			original,
			{ start: 2, end: 2, side: "additions" },
			"working",
			"revision-1",
		);
		const moved = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents: "zero\na\nb\nc",
			newContents: "zero\na\nselected\nc",
			byteSize: 17,
		});
		const changed = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents: "a\nb\nc",
			newContents: "a\ndifferent\nc",
			byteSize: 13,
		});

		expect(reviewSelectionStillExists(moved, snapshot)).toBe(true);
		expect(reviewSelectionStillExists(changed, snapshot)).toBe(false);
	});

	it("marks a changed occurrence stale when identical selected text remains elsewhere", () => {
		const original = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents: "before first\nold\nafter first\nbefore second\nold\nafter second",
			newContents: "before first\nselected\nafter first\nbefore second\nselected\nafter second",
			byteSize: 72,
		});
		const snapshot = buildReviewPromptSnapshot(
			original,
			{ start: 2, end: 2, side: "additions" },
			"working",
			"revision-1",
		);
		const changed = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents: "before first\nold\nafter first\nbefore second\nold\nafter second",
			newContents: "before first\ndifferent\nafter first\nbefore second\nselected\nafter second",
			byteSize: 73,
		});

		expect(reviewSelectionStillExists(changed, snapshot)).toBe(false);
	});

	it("does not truncate large text diffs and keeps binary files non-selectable", () => {
		const large = buildReviewFile({
			path: "generated.txt",
			changeType: "added",
			oldContents: "",
			newContents: numberedLines(5_000),
			byteSize: 50_000,
		});
		expect(large.additions).toBe(5_000);
		expect(large.lines.filter((line) => line.type === "addition")).toHaveLength(5_000);

		const binary = buildBinaryReviewFile({
			path: "image.png",
			changeType: "added",
			byteSize: 128,
			contentIdentity: "binary",
		});
		expect(binary.binary).toBe(true);
		expect(binary.lines).toEqual([]);
	});

	it("treats line-ending differences between the two sides as noise", () => {
		const text = numberedLines(20);
		const oldContents = text.replace(/\n/g, "\r\n");
		const newContents = text.replace("line 5", "changed five");

		const file = buildReviewFile({
			path: "src/example.ts",
			changeType: "modified",
			oldContents,
			newContents,
			byteSize: Buffer.byteLength(newContents),
		});

		expect(file.hunks).toHaveLength(1);
		expect(file.additions).toBe(1);
		expect(file.deletions).toBe(1);
		expect(file.lines.filter((line) => line.type === "addition")).toEqual([
			expect.objectContaining({ newLineNumber: 5, text: "changed five" }),
		]);
		expect(file.lines.some((line) => line.text.includes("\r"))).toBe(false);
	});
});
