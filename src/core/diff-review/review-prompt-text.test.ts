import { describe, expect, it } from "vitest";
import { buildReviewFile, buildReviewPromptSnapshot } from "./diff-review-model.js";
import { renderReviewPrompt } from "./review-prompt-text.js";

function snapshot() {
	const file = buildReviewFile({
		path: "src/a.ts",
		changeType: "modified",
		oldContents: "old\n",
		newContents: "new\n",
		byteSize: 4,
	});
	return buildReviewPromptSnapshot(
		file,
		{ start: 1, end: 1, side: "additions" },
		"working",
		"revision",
	);
}

describe("renderReviewPrompt", () => {
	it("includes the file, ranges, feedback, and the selected diff", () => {
		const text = renderReviewPrompt(
			{ feedback: "Rename this", snapshot: snapshot() },
			{ stale: false },
		);

		expect(text).toContain("Review Prompt");
		expect(text).toContain("File: src/a.ts");
		expect(text).toContain("New lines: 1");
		expect(text).toContain("Feedback:\nRename this");
		expect(text).toContain("Selected diff:");
		expect(text).toContain("| new");
	});

	it("omits the feedback section when there is no feedback yet", () => {
		const text = renderReviewPrompt({ feedback: "  ", snapshot: snapshot() }, { stale: false });

		expect(text).not.toContain("Feedback:");
		expect(text).toContain("Selected diff:");
	});

	it("appends the stale and verification notices", () => {
		const text = renderReviewPrompt(
			{ feedback: "Check", snapshot: snapshot() },
			{ stale: true, verificationError: "git failed" },
		);

		expect(text).toContain("STALE CONTEXT:");
		expect(text).toContain("CONTEXT CHECK UNAVAILABLE: git failed");
	});

	it("returns the feedback verbatim without a Review Selection", () => {
		expect(renderReviewPrompt({ feedback: "Rerun the tests" }, { stale: false }))
			.toBe("Rerun the tests");
	});
});
