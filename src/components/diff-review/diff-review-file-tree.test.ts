import { describe, expect, it } from "vitest";
import {
	buildDiffReviewFileTree,
	diffReviewFilePathsInTreeOrder,
} from "./diff-review-file-tree.js";

describe("Diff Review file tree", () => {
	it("groups files by directory with directories before files", () => {
		expect(buildDiffReviewFileTree([
			"README.md",
			"src/routes/index.tsx",
			"src/app.ts",
			"docs/guide.md",
		])).toEqual([
			{
				kind: "directory",
				directoryPath: "docs",
				name: "docs",
				children: [{ kind: "file", filePath: "docs/guide.md", name: "guide.md" }],
			},
			{
				kind: "directory",
				directoryPath: "src",
				name: "src",
				children: [
					{
						kind: "directory",
						directoryPath: "src/routes",
						name: "routes",
						children: [{
							kind: "file",
							filePath: "src/routes/index.tsx",
							name: "index.tsx",
						}],
					},
					{ kind: "file", filePath: "src/app.ts", name: "app.ts" },
				],
			},
			{ kind: "file", filePath: "README.md", name: "README.md" },
		]);
	});

	it("rejects paths without a file name", () => {
		expect(() => buildDiffReviewFileTree(["src/"]))
			.toThrow("Invalid Diff Review file path: src/");
	});

	it("lists files in the same order as the tree", () => {
		const tree = buildDiffReviewFileTree([
			"README.md",
			"src/routes/index.tsx",
			"src/app.ts",
			"docs/guide.md",
		]);

		expect(diffReviewFilePathsInTreeOrder(tree)).toEqual([
			"docs/guide.md",
			"src/routes/index.tsx",
			"src/app.ts",
			"README.md",
		]);
	});
});
