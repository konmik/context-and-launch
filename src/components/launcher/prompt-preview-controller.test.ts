import { describe, it, expect, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { createPromptPreviewController } from "./prompt-preview-controller.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

function makeTicket(overrides: Partial<TicketInfo> & { folderName: string }): TicketInfo {
	return {
		number: overrides.number ?? "T-1",
		title: overrides.title ?? "Test ticket",
		status: overrides.status ?? "todo",
		contextNames: [],
		useWorktree: false,
		hasAgentWorktree: false,
		fileNames: [],
		references: [],
		...overrides,
	};
}

function makeConfig(templateText: string): MergedLauncherConfig {
	return {
		templates: [{ name: "default", text: templateText, scope: "project" }],
		skills: [],
		profiles: [],
		shortcuts: [],
		columnDefaults: {},
		worktreeRootPath: null,
		conflictResolutionPrompt: "",
	};
}

describe("createPromptPreviewController", () => {
	it("updates prompt when ticket folderName changes", () => {
		createRoot((dispose) => {
			const [ticket, setTicket] = createSignal(
				makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha" }),
			);
			const cfg = makeConfig("Dir: {{ticketDir}} Slug: {{ticketSlug}}");

			const ctrl = createPromptPreviewController({
				selectedTemplate: () => "default",
				checkedSkills: () => new Set(),
				orderedSkills: () => [],
				config: () => cfg,
				ticket,
				projectPath: () => "/project",
				worktreeDir: () => "/work",
				projectSlug: "test",
				launchDir: () => "/project",
				initialEditedPrompt: undefined,
				onEditedPromptChange: () => {},
			});

			expect(ctrl.currentPrompt()).toContain("t-1-alpha");
			expect(ctrl.currentPrompt()).not.toContain("t-1-beta");

			setTicket(makeTicket({ folderName: "t-1-beta", number: "T-1", title: "Beta" }));

			expect(ctrl.currentPrompt()).toContain("t-1-beta");
			expect(ctrl.currentPrompt()).not.toContain("t-1-alpha");

			dispose();
		});
	});

	it("updates ticketTitle and ticketNumber in prompt when ticket changes", () => {
		createRoot((dispose) => {
			const [ticket, setTicket] = createSignal(
				makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha" }),
			);
			const cfg = makeConfig("{{ticketNumber}} - {{ticketTitle}}");

			const ctrl = createPromptPreviewController({
				selectedTemplate: () => "default",
				checkedSkills: () => new Set(),
				orderedSkills: () => [],
				config: () => cfg,
				ticket,
				projectPath: () => "/project",
				worktreeDir: () => "/work",
				projectSlug: "test",
				launchDir: () => "/project",
				initialEditedPrompt: undefined,
				onEditedPromptChange: () => {},
			});

			expect(ctrl.currentPrompt()).toContain("T-1 - Alpha");

			setTicket(makeTicket({ folderName: "t-2-beta", number: "T-2", title: "Beta" }));

			expect(ctrl.currentPrompt()).toContain("T-2 - Beta");
			expect(ctrl.currentPrompt()).not.toContain("T-1");

			dispose();
		});
	});

	it("generated prompt contains worktreeDir and folderName in ticketDir", () => {
		createRoot((dispose) => {
			const ticket = makeTicket({ folderName: "t-1-alpha" });
			const cfg = makeConfig("{{ticketDir}}");

			const ctrl = createPromptPreviewController({
				selectedTemplate: () => "default",
				checkedSkills: () => new Set(),
				orderedSkills: () => [],
				config: () => cfg,
				ticket: () => ticket,
				projectPath: () => "/project",
				worktreeDir: () => "/work",
				projectSlug: "test",
				launchDir: () => "/project",
				initialEditedPrompt: undefined,
				onEditedPromptChange: () => {},
			});

			expect(ctrl.currentPrompt()).toBe("/work/t-1-alpha");

			dispose();
		});
	});

	it("interpolates {{launchDir}} placeholder", () => {
		createRoot((dispose) => {
			const ticket = makeTicket({ folderName: "t-1-alpha" });
			const cfg = makeConfig("dir: {{launchDir}}");

			const ctrl = createPromptPreviewController({
				selectedTemplate: () => "default",
				checkedSkills: () => new Set(),
				orderedSkills: () => [],
				config: () => cfg,
				ticket: () => ticket,
				projectPath: () => "/project",
				worktreeDir: () => "/work",
				projectSlug: "test",
				launchDir: () => "/custom/launch/dir",
				initialEditedPrompt: undefined,
				onEditedPromptChange: () => {},
			});

			expect(ctrl.currentPrompt()).toBe("dir: /custom/launch/dir");

			dispose();
		});
	});

	it("starts in edit mode showing the saved edited prompt", () => {
		createRoot((dispose) => {
			const ticket = makeTicket({ folderName: "t-1-alpha" });
			const cfg = makeConfig("generated {{ticketSlug}}");

			const ctrl = createPromptPreviewController({
				selectedTemplate: () => "default",
				checkedSkills: () => new Set(),
				orderedSkills: () => [],
				config: () => cfg,
				ticket: () => ticket,
				projectPath: () => "/project",
				worktreeDir: () => "/work",
				projectSlug: "test",
				launchDir: () => "/project",
				initialEditedPrompt: "my saved prompt",
				onEditedPromptChange: () => {},
			});

			expect(ctrl.editMode()).toBe(true);
			expect(ctrl.currentPrompt()).toBe("my saved prompt");

			dispose();
		});
	});

	it("persists edited prompt after debounce", async () => {
		vi.useFakeTimers();
		try {
			await createRoot(async (dispose) => {
				const ticket = makeTicket({ folderName: "t-1-alpha" });
				const cfg = makeConfig("generated");
				const saved: (string | undefined)[] = [];

				const ctrl = createPromptPreviewController({
					selectedTemplate: () => "default",
					checkedSkills: () => new Set(),
					orderedSkills: () => [],
					config: () => cfg,
					ticket: () => ticket,
					projectPath: () => "/project",
					worktreeDir: () => "/work",
					projectSlug: "test",
					launchDir: () => "/project",
					initialEditedPrompt: undefined,
					onEditedPromptChange: (v) => saved.push(v),
				});

				ctrl.setEditMode(true);
				ctrl.setEditedPrompt("edited text");
				expect(saved).toEqual([]);
				await vi.advanceTimersByTimeAsync(500);
				expect(saved).toEqual(["edited text"]);

				dispose();
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears the saved edited prompt when edit mode is turned off", async () => {
		vi.useFakeTimers();
		try {
			await createRoot(async (dispose) => {
				const ticket = makeTicket({ folderName: "t-1-alpha" });
				const cfg = makeConfig("generated");
				const saved: (string | undefined)[] = [];

				const ctrl = createPromptPreviewController({
					selectedTemplate: () => "default",
					checkedSkills: () => new Set(),
					orderedSkills: () => [],
					config: () => cfg,
					ticket: () => ticket,
					projectPath: () => "/project",
					worktreeDir: () => "/work",
					projectSlug: "test",
					launchDir: () => "/project",
					initialEditedPrompt: "old",
					onEditedPromptChange: (v) => saved.push(v),
				});

				ctrl.setEditMode(false);
				await vi.advanceTimersByTimeAsync(500);
				expect(saved).toEqual([undefined]);
				expect(ctrl.editMode()).toBe(false);
				expect(ctrl.currentPrompt()).toBe("generated");

				dispose();
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("resetFromSaved restores edit state for a column without re-persisting", async () => {
		vi.useFakeTimers();
		try {
			await createRoot(async (dispose) => {
				const ticket = makeTicket({ folderName: "t-1-alpha" });
				const cfg = makeConfig("generated");
				const saved: (string | undefined)[] = [];

				const ctrl = createPromptPreviewController({
					selectedTemplate: () => "default",
					checkedSkills: () => new Set(),
					orderedSkills: () => [],
					config: () => cfg,
					ticket: () => ticket,
					projectPath: () => "/project",
					worktreeDir: () => "/work",
					projectSlug: "test",
					launchDir: () => "/project",
					initialEditedPrompt: undefined,
					onEditedPromptChange: (v) => saved.push(v),
				});

				expect(ctrl.editMode()).toBe(false);
				ctrl.resetFromSaved("prompt from another column");
				expect(ctrl.editMode()).toBe(true);
				expect(ctrl.currentPrompt()).toBe("prompt from another column");

				ctrl.resetFromSaved(undefined);
				expect(ctrl.editMode()).toBe(false);
				expect(ctrl.currentPrompt()).toBe("generated");

				await vi.advanceTimersByTimeAsync(500);
				expect(saved).toEqual([]);

				dispose();
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("restores edit mode when the saved edited prompt is empty", () => {
		createRoot((dispose) => {
			const ticket = makeTicket({ folderName: "t-1-alpha" });
			const cfg = makeConfig("generated");

			const ctrl = createPromptPreviewController({
				selectedTemplate: () => "default",
				checkedSkills: () => new Set(),
				orderedSkills: () => [],
				config: () => cfg,
				ticket: () => ticket,
				projectPath: () => "/project",
				worktreeDir: () => "/work",
				projectSlug: "test",
				launchDir: () => "/project",
				initialEditedPrompt: "",
				onEditedPromptChange: () => {},
			});

			expect(ctrl.editMode()).toBe(true);
			expect(ctrl.currentPrompt()).toBe("");

			dispose();
		});
	});

	it("stays in edit mode after the edited text is cleared to empty", async () => {
		vi.useFakeTimers();
		try {
			await createRoot(async (dispose) => {
				const ticket = makeTicket({ folderName: "t-1-alpha" });
				const cfg = makeConfig("generated");
				const saved: (string | undefined)[] = [];

				const ctrl = createPromptPreviewController({
					selectedTemplate: () => "default",
					checkedSkills: () => new Set(),
					orderedSkills: () => [],
					config: () => cfg,
					ticket: () => ticket,
					projectPath: () => "/project",
					worktreeDir: () => "/work",
					projectSlug: "test",
					launchDir: () => "/project",
					initialEditedPrompt: "hand written",
					onEditedPromptChange: (v) => saved.push(v),
				});

				ctrl.setEditedPrompt("");
				await vi.advanceTimersByTimeAsync(500);
				expect(ctrl.editMode()).toBe(true);
				expect(ctrl.currentPrompt()).toBe("");
				expect(saved).toEqual([""]);

				dispose();
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
