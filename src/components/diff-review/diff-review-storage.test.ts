import { expect, it, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";
import { succeed } from "~/util/result.js";
import { createDiffReviewStorage } from "./diff-review-storage.js";

it("keeps captured review operations on their original project after navigation", async () => {
	await createRoot(async dispose => {
		try {
			const empty: DiffReviewProjectState = { version: 2, tickets: {} };
			const saved = new Map<string, DiffReviewProjectState>([["first", empty], ["second", empty]]);
			const [slug, setSlug] = createSignal("first");
			let resume!: () => void;
			let started!: () => void;
			const reading = new Promise<void>(resolve => { started = resolve; });
			const release = vi.fn(async () => {});
			let delay = true;
			const service = createDiffReviewStorage({ get projectSlug() { return slug(); } }, {
				async read(project, owner) {
					if (owner && delay) {
						delay = false;
						started();
						await new Promise<void>(resolve => { resume = resolve; });
					}
					return succeed(saved.get(project)!);
				},
				async save(project, json) {
					saved.set(project, JSON.parse(json));
					return succeed(saved.get(project)!);
				},
				release,
			});
			const view = { get: service.get, update: service.update, refresh: service.refresh };
			const ticket = { worktreeIdentity: "first-worktree", reviewedLines: {}, queue: { items: [] } };
			const pending = view.update(current => ({ ...current, tickets: { ...current.tickets, ticket } }));
			await reading;
			setSlug("second");
			flush();
			await service.refresh();
			resume();
			expect((await pending).type).toBe("Success");
			flush();
			expect(service.get()).toEqual(empty);
			expect(view.get().tickets.ticket).toEqual(ticket);
			// A closing view flushes work that had not yet entered the write queue.
			await view.update(current => ({ ...current, tickets: { ...current.tickets, closing: ticket } }));
			await view.refresh();
			flush();
			expect(Object.keys(saved.get("first")!.tickets)).toEqual(["ticket", "closing"]);
			expect(saved.get("second")).toEqual(empty);
			expect(view.get()).toEqual(saved.get("first"));
			expect(service.get()).toEqual(empty);
			expect(release.mock.calls).toEqual([
				["first", expect.any(String)], ["first", expect.any(String)],
			]);
		} finally { dispose(); }
	});
});
