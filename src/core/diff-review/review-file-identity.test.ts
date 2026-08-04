import { describe, expect, it } from "vitest";
import { buildReviewFile } from "./diff-review-model.js";
import { reuseUnchangedFiles } from "./review-file-identity.js";

function file(path: string, contents: string) {
	return buildReviewFile({
		path,
		changeType: "modified",
		oldContents: "old\n",
		newContents: contents,
		byteSize: contents.length,
	});
}

describe("reuseUnchangedFiles", () => {
	it("keeps the previous object for files whose content did not change", () => {
		const previous = [file("a.ts", "one\n"), file("b.ts", "two\n")];
		const next = [file("a.ts", "one\n"), file("b.ts", "two changed\n")];

		const result = reuseUnchangedFiles(previous, next);

		expect(result[0]).toBe(previous[0]);
		expect(result[1]).toBe(next[1]);
	});

	it("passes through files that are new or renamed", () => {
		const previous = [file("a.ts", "one\n")];
		const next = [file("a.ts", "one\n"), file("c.ts", "three\n")];

		const result = reuseUnchangedFiles(previous, next);

		expect(result[0]).toBe(previous[0]);
		expect(result[1]).toBe(next[1]);
		expect(reuseUnchangedFiles(next, [])).toEqual([]);
	});
});
