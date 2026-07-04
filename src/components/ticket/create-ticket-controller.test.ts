import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
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

					await ctrl.suggestNumber();

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

					await ctrl.suggestNumber();

					expect(ctrl.number()).toBe("T-42");
					expect(ctrl.suggestingNumber()).toBe(false);
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

					const suggestPromise = ctrl.suggestNumber();
					expect(ctrl.suggestingNumber()).toBe(true);

					ctrl.setNumber("T-1");
					ctrl.setTitle("Some title");
					await ctrl.doSubmit();

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
