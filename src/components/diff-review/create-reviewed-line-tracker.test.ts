import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal, flush } from "solid-js";
import { createReviewedLineTracker } from "./diff-review-storage.js";
import { fail, succeed, type Result } from "~/util/result.js";
import { createStoredSignal } from "~/util/stored-signal.js";
import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";

afterEach(() => vi.useRealTimers());

function setup() {
	let persisted: DiffReviewProjectState = { version: 2, tickets: {
		ticket: { worktreeIdentity: "worktree", reviewedLines: {}, queue: { items: [] } },
		other: { worktreeIdentity: "other", reviewedLines: {}, queue: { items: [] } },
	} };
	const [initial, setInitial] = createSignal(persisted);
	const persist = vi.fn(async (next: DiffReviewProjectState): Promise<Result<DiffReviewProjectState, string>> =>
		succeed(next));
	const state = createStoredSignal(initial, async transform => {
		const result = await persist(transform(persisted));
		if (result.type === "Success") persisted = result.value;
		return result;
	});
	const onError = vi.fn();
	const tracker = createReviewedLineTracker({ state, folderName: "ticket", worktreeIdentity: "worktree", onError });
	return { state, tracker, persist, onError, acknowledge() {
		persisted = { ...persisted, tickets: { ...persisted.tickets, ticket: { ...persisted.tickets.ticket,
			reviewedLines: { "line-1": { path: "src/a.ts", reviewedAt: "2026-09-25T00:00:00.000Z" } },
		} } };
		setInitial(persisted);
		flush();
	} };
}

describe("createReviewedLineTracker", () => {
	it("does not resubmit lines already acknowledged by the server", async () => {
		vi.useFakeTimers();
		const { tracker, persist, acknowledge } = setup();
		acknowledge();
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).not.toHaveBeenCalled();
	});

	it("batches visible lines without changing another ticket", async () => {
		vi.useFakeTimers();
		const { tracker, persist, state } = setup();
		const other = state.get().tickets.other;
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		tracker.markVisible({ id: "line-2", path: "src/b.ts" });
		flush();
		expect([...tracker.reviewedLineIds()]).toEqual(["line-1", "line-2"]);
		await vi.advanceTimersByTimeAsync(400);
		flush();
		expect(state.get().tickets.ticket.reviewedLines).toEqual({
			"line-1": { path: "src/a.ts", reviewedAt: expect.any(String) },
			"line-2": { path: "src/b.ts", reviewedAt: expect.any(String) },
		});
		expect(state.get().tickets.other).toEqual(other);
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it("rolls back a failed write and retries when the line is visible again", async () => {
		vi.useFakeTimers();
		const { tracker, persist, onError } = setup();
		persist.mockResolvedValueOnce(fail("disk full"));
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		flush();
		expect([...tracker.reviewedLineIds()]).toEqual([]);
		expect(onError).toHaveBeenCalledWith("disk full");
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).toHaveBeenCalledTimes(2);
	});

	it("keeps a server acknowledgment received while a write is in flight", async () => {
		const { tracker, persist, acknowledge } = setup();
		let rejectWrite!: (error: Error) => void;
		persist.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		const writing = tracker.flush();
		await Promise.resolve();
		acknowledge();
		rejectWrite(new Error("late failure"));
		await writing;
		flush();
		expect([...tracker.reviewedLineIds()]).toEqual(["line-1"]);
	});

	it.each([false, true])("drains an in-flight batch and pending lines (closing: %s)", async closing => {
		const { tracker, persist, state } = setup();
		let finish!: () => void;
		persist.mockImplementationOnce(next => new Promise(resolve => { finish = () => resolve(succeed(next)); }));
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		const first = tracker.flush();
		await Promise.resolve();
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		tracker.markVisible({ id: "line-2", path: "src/b.ts" });
		const joined = closing ? tracker.dispose() : tracker.flush();
		expect(persist).toHaveBeenCalledTimes(1);
		finish();
		await Promise.all([first, joined]);
		flush();
		expect(persist).toHaveBeenCalledTimes(2);
		expect(Object.keys(state.get().tickets.ticket.reviewedLines)).toEqual(["line-1", "line-2"]);
	});
});
