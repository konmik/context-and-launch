import { describe, it, expect } from "vitest";
import { createRoot, createSignal, flush, runWithOwner } from "solid-js";
import { createCreateTicketController, type CreateTicketDeps } from "./create-ticket-controller.js";

function makeDeps(overrides?: Partial<CreateTicketDeps>): CreateTicketDeps {
	return {
		onSubmit: async () => ({}),
		onOpenChange: () => {},
		suggestedNextNumber: () => null,
		open: () => true,
		onSuggestNumber: async () => null,
		...overrides,
	};
}

describe("createCreateTicketController", () => {
	describe("suggestNumber", () => {
		it("sets errorMsg when onSuggestNumber rejects", async () => {
			await createRoot(async (dispose) => {
				try {
					const deps = makeDeps({
						onSuggestNumber: async () => { throw new Error("server broke"); },
					});
					const ctrl = createCreateTicketController(deps);

					await runWithOwner(null, ctrl.suggestNumber);
					flush();

					expect(ctrl.errorMsg()).toBe("server broke");
					expect(ctrl.suggestingNumber()).toBe(false);
				} finally {
					dispose();
				}
			});
		});

		it("resets suggestingNumber after successful suggestion", async () => {
			await createRoot(async (dispose) => {
				try {
					const deps = makeDeps({
						onSuggestNumber: async () => "T-42",
					});
					const ctrl = createCreateTicketController(deps);

					await runWithOwner(null, ctrl.suggestNumber);
					flush();

					expect(ctrl.number()).toBe("T-42");
					expect(ctrl.suggestingNumber()).toBe(false);
				} finally {
					dispose();
				}
			});
		});

	});

	describe("seeding from the suggested number", () => {
		it("seeds the number when the dialog opens", async () => {
			await createRoot(async (dispose) => {
				try {
					const [open, setOpen] = createSignal(false);
					const ctrl = createCreateTicketController(makeDeps({
						open,
						suggestedNextNumber: () => "ST-0003",
					}));
					flush();
					expect(ctrl.number()).toBe("");

					runWithOwner(null, () => setOpen(true));
					flush();

					expect(ctrl.number()).toBe("ST-0003");
				} finally {
					dispose();
				}
			});
		});

		it("keeps a regenerated number when the page revalidates while open", async () => {
			await createRoot(async (dispose) => {
				try {
					const [suggested, setSuggested] = createSignal<string | null>("ST-0003");
					const ctrl = createCreateTicketController(makeDeps({
						open: () => true,
						suggestedNextNumber: suggested,
						onSuggestNumber: async () => "BUG-0002",
					}));
					flush();

					await runWithOwner(null, ctrl.suggestNumber);
					flush();
					expect(ctrl.number()).toBe("BUG-0002");

					// The server call revalidates the project page, which re-emits the
					// board-wide suggestion. It must not overwrite what the user has.
					runWithOwner(null, () => setSuggested("ST-0004"));
					flush();

					expect(ctrl.number()).toBe("BUG-0002");
				} finally {
					dispose();
				}
			});
		});
	});

	describe("doSubmit", () => {
		it("does not call onSubmit while suggestingNumber is true", async () => {
			let resolveSuggest!: (v: string | null) => void;
			const submitSpy = { called: false };

			await createRoot(async (dispose) => {
				try {
					const deps = makeDeps({
						onSubmit: async () => { submitSpy.called = true; return {}; },
						onSuggestNumber: () => new Promise((r) => { resolveSuggest = r; }),
					});
					const ctrl = createCreateTicketController(deps);

					const suggestPromise = runWithOwner(null, ctrl.suggestNumber);
					flush();
					expect(ctrl.suggestingNumber()).toBe(true);

					runWithOwner(null, () => {
						ctrl.setNumber("T-1");
						ctrl.setTitle("Some title");
					});
					flush();
					await runWithOwner(null, ctrl.doSubmit);

					expect(submitSpy.called).toBe(false);

					resolveSuggest(null);
					await suggestPromise;
				} finally {
					dispose();
				}
			});
		});
	});
});
