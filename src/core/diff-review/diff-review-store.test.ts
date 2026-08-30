import { afterEach, describe, expect, it } from "vitest";
import { ConfigPaths } from "../config/config-paths.js";
import { ConfigRepository } from "../config/config-repository.js";
import type { DiffReviewProjectState } from "./diff-review-types.js";
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

function createStore() {
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
		store.beginDelivery("project", "st-1-ticket", "old-worktree", item.id);
		store.failDelivery("project", "st-1-ticket", "old-worktree", item.id, "delivery failed");
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

	it("retries a delivered head and refuses one that is still delivering", () => {
		const { store } = createStore();
		const item = store.enqueue("project", "st-1-ticket", "worktree", "Feedback");
		store.beginDelivery("project", "st-1-ticket", "worktree", item.id);
		store.completeDelivery(
			"project",
			"st-1-ticket",
			"worktree",
			item.id,
			new Date("2026-07-25T12:00:00.000Z"),
			3_000,
		);

		store.retry("project", "st-1-ticket", "worktree", item.id);
		const head = store.getTicket("project", "st-1-ticket", "worktree").queue.items[0];
		expect(head.state).toBe("waiting");
		expect("sentAt" in head).toBe(false);

		store.beginDelivery("project", "st-1-ticket", "worktree", item.id);
		expect(() => store.retry("project", "st-1-ticket", "worktree", item.id))
			.toThrow(/failed, uncertain, or delivered/);
	});

	it("removes an unsent prompt and refuses one already delivering", () => {
		const { store } = createStore();
		const first = store.enqueue("project", "st-1-ticket", "worktree", "First");
		const second = store.enqueue("project", "st-1-ticket", "worktree", "Second");

		store.removeQueueItem("project", "st-1-ticket", "worktree", second.id);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.id),
		).toEqual([first.id]);

		store.beginDelivery("project", "st-1-ticket", "worktree", first.id);
		expect(() => store.removeQueueItem("project", "st-1-ticket", "worktree", first.id))
			.toThrow(/already delivering/);
		expect(() => store.removeQueueItem("project", "st-1-ticket", "worktree", second.id))
			.toThrow(/no longer in the queue/);
	});

	it("persists an Agent launch reservation and converts it to cooldown", () => {
		const { store } = createStore();
		store.reserveAgentLaunch(
			"project",
			"st-1-ticket",
			"worktree",
			new Date("2026-07-25T12:00:45.000Z"),
		);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree")
				.queue.agentLaunchReservedUntil,
		).toBe("2026-07-25T12:00:45.000Z");

		store.completeAgentLaunch(
			"project",
			"st-1-ticket",
			"worktree",
			new Date("2026-07-25T12:00:45.000Z"),
		);
		const queue = store.getTicket("project", "st-1-ticket", "worktree").queue;
		expect(queue.agentLaunchReservedUntil).toBeUndefined();
		expect(queue.cooldownUntil).toBe("2026-07-25T12:00:45.000Z");
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
		) as DiffReviewProjectState;
		expect(persisted.tickets).toEqual({});
	});
});
