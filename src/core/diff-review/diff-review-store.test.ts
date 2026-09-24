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
	it("serializes background delivery behind a client transform without losing either ticket", async () => {
		const { store } = createStore();
		const head = store.enqueue("project", "ticket-a", "worktree", "First");
		store.enqueue("project", "ticket-b", "other-worktree", "Second");
		const current = store.getTicket("project", "ticket-a", "worktree", "browser");
		expect(() => store.getTicket("project", "ticket-b", "other-worktree", "other-browser"))
			.toThrow(/being updated/);
		const delivery = store.whenWritable("project", () =>
			store.beginDelivery("project", "ticket-a", "worktree", head.id));
		expect(store.getTicket("project", "ticket-a", "worktree").queue.items[0].state).toBe("waiting");
		store.updateTicket("project", "ticket-a", "worktree", () => ({ ...current,
			reviewedLines: { line: { path: "a.ts", reviewedAt: new Date().toISOString() } },
		}), "browser");
		await delivery;
		const restored = store.getTicket("project", "ticket-a", "worktree");
		expect(restored.queue.items[0].state).toBe("delivering");
		expect(Object.keys(restored.reviewedLines)).toEqual(["line"]);
		expect(store.getTicket("project", "ticket-b", "other-worktree").queue.items[0].feedback).toBe("Second");
	});

	it("releases failed saves and rejects stale worktree state", () => {
		const { store } = createStore();
		const current = store.getTicket("project", "ticket", "old-worktree", "browser");
		expect(() => store.updateTicket("project", "ticket", "new-worktree", () => current, "browser"))
			.toThrow(/worktree changed/);
		const next = store.getTicket("project", "ticket", "new-worktree", "next-browser");
		expect(next.queue.items).toEqual([]);
		store.release("project", "next-browser");
		expect(() => store.updateTicket("project", "ticket", "new-worktree", () => next, "next-browser"))
			.toThrow(/missing or expired/);
	});

	it("migrates legacy queues on the next successful write", () => {
		const { store, paths } = createStore();
		const repository = new ConfigRepository();
		repository.writeJson(paths.diffReviewStateFile("project"), {
			version: 1, tickets: { ticket: { worktreeIdentity: "worktree", queue: { items: [] } } },
		});
		const current = store.getTicket("project", "ticket", "worktree", "browser");
		expect(current.reviewedLines).toEqual({});
		store.updateTicket("project", "ticket", "worktree", () => current, "browser");
		expect(repository.readJson(paths.diffReviewStateFile("project"))).toEqual({
			version: 2, tickets: { ticket: current },
		});
	});

	it("persists immutable FIFO prompts and reviewed lines", () => {
		const { store } = createStore();
		const snapshot = promptSnapshot("src/a.ts");
		store.updateTicket(
			"project",
			"st-1-ticket",
			"worktree",
			current => ({ ...current,
				reviewedLines: { "l-1": { path: "src/a.ts", reviewedAt: new Date().toISOString() } },
			}),
		);
		const first = store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"First",
			snapshot,
		);
		const second = store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"Second",
			promptSnapshot("src/b.ts"),
		);
		snapshot.filePath = "changed-after-enqueue.ts";
		expect(first.snapshot?.filePath).toBe("src/a.ts");
		first.feedback = "Changed after enqueue";

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
			store.getTicket("project", "st-1-ticket", "new-worktree").queue.items,
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

	it("removes all persisted review data with the Ticket", async () => {
		const { store, paths } = createStore();
		store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"Feedback",
			promptSnapshot("src/a.ts"),
		);
		await store.removeTicket("project", "st-1-ticket");

		// SAFETY: The store just persisted this file using the DiffReviewProjectState shape under test.
		const persisted = new ConfigRepository().readJson(
			paths.diffReviewStateFile("project"),
		) as DiffReviewProjectState;
		expect(persisted.tickets).toEqual({});
	});
});
