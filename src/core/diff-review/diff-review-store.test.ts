import { afterEach, describe, expect, it } from "vitest";
import { ConfigPaths } from "../config/config-paths.js";
import { ConfigRepository } from "../config/config-repository.js";
import { makeTempDir, removeTempDirOrWarn } from "../../test-temp.js";
import { DiffReviewStore } from "./diff-review-store.js";
import type { ReviewPromptSnapshot } from "./diff-review-types.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map(removeTempDirOrWarn));
});

function promptSnapshot(filePath: string): ReviewPromptSnapshot {
	return {
		scope: "working",
		filePath,
		newRange: { start: 1, end: 1 },
		selectedLines: [{
			type: "addition",
			text: "selected",
			newLineNumber: 1,
		}],
		contextBefore: [],
		contextAfter: [],
		selectionFingerprint: "selection",
		sourceRevision: "revision",
	};
}

function createStore(): { store: DiffReviewStore; paths: ConfigPaths } {
	const baseDir = makeTempDir("diff-review-store-");
	dirs.push(baseDir);
	const paths = new ConfigPaths(baseDir);
	return {
		store: new DiffReviewStore(paths, new ConfigRepository()),
		paths,
	};
}

describe("DiffReviewStore", () => {
	it("persists immutable FIFO prompts and reviewed lines", () => {
		const { store } = createStore();
		store.markLinesReviewed(
			"project",
			"st-1-ticket",
			"worktree",
			[{ id: "l-1", path: "src/a.ts" }],
		);
		const first = store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"First",
			promptSnapshot("src/a.ts"),
		);
		const second = store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"Second",
			promptSnapshot("src/b.ts"),
		);

		const restored = store.getTicket("project", "st-1-ticket", "worktree");
		expect(Object.keys(restored.reviewedLines)).toEqual(["l-1"]);
		expect(restored.queue.items.map((item) => item.id)).toEqual([first.id, second.id]);
		expect(restored.queue.items.map((item) => item.feedback)).toEqual(["First", "Second"]);
	});

	it("keeps errors stopped until Retry and replaces state for a different worktree", () => {
		const { store } = createStore();
		const item = store.enqueue(
			"project",
			"st-1-ticket",
			"old-worktree",
			"Feedback",
			promptSnapshot("src/a.ts"),
		);
		store.updateQueue("project", "st-1-ticket", "old-worktree", (ticket) => {
			ticket.queue.items[0].state = "error";
			ticket.queue.items[0].error = "delivery failed";
		});
		expect(
			store.getTicket("project", "st-1-ticket", "old-worktree").queue.items[0].state,
		).toBe("error");
		store.retry("project", "st-1-ticket", "old-worktree", item.id);
		expect(
			store.getTicket("project", "st-1-ticket", "old-worktree").queue.items[0].state,
		).toBe("waiting");

		expect(
			store.ensureTicket("project", "st-1-ticket", "new-worktree").queue.items,
		).toEqual([]);
	});

	it("removes all persisted review data with the Ticket", () => {
		const { store, paths } = createStore();
		store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"Feedback",
			promptSnapshot("src/a.ts"),
		);
		store.removeTicket("project", "st-1-ticket");

		const persisted = new ConfigRepository().readJson(
			paths.diffReviewStateFile("project"),
		) as { tickets: Record<string, unknown> };
		expect(persisted.tickets).toEqual({});
	});
});
