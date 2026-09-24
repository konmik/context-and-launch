import { afterEach, describe, expect, it, vi } from "vitest";
import { flush } from "solid-js";
import { createReviewedLineTracker } from "./create-reviewed-line-tracker.js";
import { fail, succeed, type Result } from "~/util/result.js";

afterEach(() => {
	vi.useRealTimers();
});

describe("createReviewedLineTracker", () => {
	it("does not resubmit lines already acknowledged by the server", async () => {
		vi.useFakeTimers();
		const persist = vi.fn().mockResolvedValue(succeed(undefined));
		const tracker = createReviewedLineTracker({ saved: () => new Set(["line-1"]), persist, onError: vi.fn() });
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).not.toHaveBeenCalled();
	});

	it("batches visible lines and acknowledges a successful write", async () => {
		vi.useFakeTimers();
		const saved = new Set<string>();
		const persist = vi.fn(async (lines: { id: string }[]) => {
			for (const line of lines) saved.add(line.id);
			return succeed(undefined);
		});
		const tracker = createReviewedLineTracker({ saved: () => saved, persist, onError: vi.fn() });
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		tracker.markVisible({ id: "line-2", path: "src/b.ts" });
		flush();
		expect([...tracker.reviewedLineIds()]).toEqual(["line-1", "line-2"]);
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).toHaveBeenCalledWith([
			{ id: "line-1", path: "src/a.ts" },
			{ id: "line-2", path: "src/b.ts" },
		]);
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it("rolls back a failed write and retries when the line is visible again", async () => {
		vi.useFakeTimers();
		const persist = vi.fn()
			.mockResolvedValueOnce(fail("disk full"))
			.mockResolvedValueOnce(succeed(undefined));
		const onError = vi.fn();
		const tracker = createReviewedLineTracker({ saved: () => new Set(), persist, onError });
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect([...tracker.reviewedLineIds()]).toEqual([]);
		expect(onError).toHaveBeenCalledWith("disk full");
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		await vi.advanceTimersByTimeAsync(400);
		expect(persist).toHaveBeenCalledTimes(2);
	});

	it("keeps a server acknowledgment received while a write is in flight", async () => {
		let rejectWrite!: (error: Error) => void;
		const persist = vi.fn(() => new Promise<Result<void, string>>((_resolve, reject) => {
			rejectWrite = reject;
		}));
		const saved = new Set<string>();
		const tracker = createReviewedLineTracker({ saved: () => saved, persist, onError: vi.fn() });
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		const writing = tracker.flush();
		saved.add("line-1");
		rejectWrite(new Error("late failure"));
		await writing;
		expect([...tracker.reviewedLineIds()]).toEqual(["line-1"]);
	});

	it("serializes a line that appears while another batch is in flight", async () => {
		vi.useFakeTimers();
		let resolveFirst!: (value: Result<void, string>) => void;
		const persist = vi.fn()
			.mockImplementationOnce(() => new Promise<Result<void, string>>((resolve) => {
				resolveFirst = resolve;
			}))
			.mockResolvedValueOnce(succeed(undefined));
		const tracker = createReviewedLineTracker({ saved: () => new Set(), persist, onError: vi.fn(), debounceMs: 1 });
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		const first = tracker.flush();
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		tracker.markVisible({ id: "line-2", path: "src/b.ts" });
		const joined = tracker.flush();
		expect(persist).toHaveBeenCalledTimes(1);
		resolveFirst(succeed(undefined));
		await Promise.all([first, joined]);
		await vi.advanceTimersByTimeAsync(1);
		expect(persist).toHaveBeenNthCalledWith(2, [{ id: "line-2", path: "src/b.ts" }]);
	});

	it("persists pending lines when disposed during an in-flight write", async () => {
		let resolveFirst!: (value: Result<void, string>) => void;
		const persist = vi.fn()
			.mockImplementationOnce(() => new Promise<Result<void, string>>((resolve) => {
				resolveFirst = resolve;
			}))
			.mockResolvedValueOnce(succeed(undefined));
		const tracker = createReviewedLineTracker({ saved: () => new Set(), persist, onError: vi.fn() });
		tracker.markVisible({ id: "line-1", path: "src/a.ts" });
		const first = tracker.flush();
		tracker.markVisible({ id: "line-2", path: "src/b.ts" });
		const disposed = tracker.dispose();
		resolveFirst(succeed(undefined));
		await Promise.all([first, disposed]);
		expect(persist).toHaveBeenNthCalledWith(2, [{ id: "line-2", path: "src/b.ts" }]);
	});
});
