import { describe, it, expect } from "vitest";
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
			});

			expect(ctrl.currentPrompt()).toBe("dir: /custom/launch/dir");

			dispose();
		});
	});
});
