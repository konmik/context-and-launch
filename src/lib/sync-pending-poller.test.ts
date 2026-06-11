import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { createSyncPendingPoller } from "./sync-pending-poller.js";

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(hasPendingChanges: boolean) {
	return { ok: true, json: async () => ({ hasPendingChanges }) };
}

describe("createSyncPendingPoller", () => {
	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("window", {});
		vi.stubGlobal("fetch", fetchMock);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("initial poll sets the signal from the response", async () => {
		fetchMock.mockResolvedValue(jsonResponse(true));
		await createRoot(async (dispose) => {
			const { hasPendingChanges } = createSyncPendingPoller(() => "my-proj");
			expect(hasPendingChanges()).toBe(false);
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledWith("/api/projects/my-proj/board/pending");
			expect(hasPendingChanges()).toBe(true);
			dispose();
		});
	});

	it("interval polls update the signal when the server state changes", async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse(false))
			.mockResolvedValueOnce(jsonResponse(true));
		await createRoot(async (dispose) => {
			const { hasPendingChanges } = createSyncPendingPoller(() => "my-proj");
			await vi.advanceTimersByTimeAsync(0);
			expect(hasPendingChanges()).toBe(false);
			await vi.advanceTimersByTimeAsync(2000);
			expect(hasPendingChanges()).toBe(true);
			dispose();
		});
	});

	it("a failed poll warns and keeps the last known value", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		fetchMock
			.mockResolvedValueOnce(jsonResponse(true))
			.mockRejectedValueOnce(new Error("network down"));
		try {
			await createRoot(async (dispose) => {
				const { hasPendingChanges } = createSyncPendingPoller(() => "my-proj");
				await vi.advanceTimersByTimeAsync(0);
				expect(hasPendingChanges()).toBe(true);
				await vi.advanceTimersByTimeAsync(2000);
				expect(hasPendingChanges()).toBe(true);
				expect(warnSpy).toHaveBeenCalled();
				dispose();
			});
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("a non-OK response warns and keeps the last known value", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		fetchMock
			.mockResolvedValueOnce(jsonResponse(true))
			.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
		try {
			await createRoot(async (dispose) => {
				const { hasPendingChanges } = createSyncPendingPoller(() => "my-proj");
				await vi.advanceTimersByTimeAsync(0);
				expect(hasPendingChanges()).toBe(true);
				await vi.advanceTimersByTimeAsync(2000);
				expect(hasPendingChanges()).toBe(true);
				expect(warnSpy).toHaveBeenCalled();
				dispose();
			});
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("switching projects resets the signal and polls the new project", async () => {
		fetchMock.mockResolvedValue(jsonResponse(true));
		await createRoot(async (dispose) => {
			const [projectSlug, setProjectSlug] = createSignal("proj-a");
			const { hasPendingChanges } = createSyncPendingPoller(projectSlug);
			await vi.advanceTimersByTimeAsync(0);
			expect(hasPendingChanges()).toBe(true);

			setProjectSlug("proj-b");
			expect(hasPendingChanges()).toBe(false);
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/proj-b/board/pending");
			expect(hasPendingChanges()).toBe(true);
			dispose();
		});
	});

	it("dispose stops polling", async () => {
		fetchMock.mockResolvedValue(jsonResponse(false));
		await createRoot(async (dispose) => {
			createSyncPendingPoller(() => "my-proj");
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			dispose();
			await vi.advanceTimersByTimeAsync(6000);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});
});
