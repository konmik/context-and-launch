import { describe, expect, it } from "vitest";
import type { ReviewFileSnapshot } from "~/core/diff-review/diff-review-types.js";
import {
	buildFileTypeTotals,
	fileTypeOf,
} from "./diff-review-file-type-totals.js";

function file(
	path: string,
	additions: number,
	deletions: number,
): ReviewFileSnapshot {
	return {
		path,
		changeType: "modified",
		additions,
		deletions,
		binary: false,
		byteSize: 0,
		contentHash: path,
		hunks: [],
		lines: [],
	};
}

describe("Diff Review file type totals", () => {
	it("takes the last extension as the file type", () => {
		expect(fileTypeOf("src/routes/index.tsx")).toBe(".tsx");
		expect(fileTypeOf("src/app.test.ts")).toBe(".ts");
		expect(fileTypeOf("README.md")).toBe(".md");
	});

	it("labels extension-less files as no ext", () => {
		expect(fileTypeOf("Dockerfile")).toBe("no ext");
		expect(fileTypeOf(".gitignore")).toBe("no ext");
		expect(fileTypeOf(".env.example")).toBe(".example");
	});

	it("sums additions and deletions per file type", () => {
		expect(buildFileTypeTotals([
			file("src/app.ts", 10, 2),
			file("src/other.ts", 5, 1),
			file("src/index.tsx", 3, 0),
		])).toEqual([
			{ fileType: ".ts", additions: 15, deletions: 3 },
			{ fileType: ".tsx", additions: 3, deletions: 0 },
		]);
	});

	it("orders file types by total changes then alphabetically", () => {
		expect(buildFileTypeTotals([
			file("a.md", 1, 1),
			file("b.tsx", 5, 0),
			file("c.ts", 2, 2),
		])).toEqual([
			{ fileType: ".tsx", additions: 5, deletions: 0 },
			{ fileType: ".ts", additions: 2, deletions: 2 },
			{ fileType: ".md", additions: 1, deletions: 1 },
		]);
	});

	it("returns nothing for no files", () => {
		expect(buildFileTypeTotals([])).toEqual([]);
	});
});
