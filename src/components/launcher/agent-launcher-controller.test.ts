import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import { createAgentLauncherController } from "./agent-launcher-controller.js";

describe("createAgentLauncherController resolveDefaults integration", () => {
	it("exposes column defaults for the ticket status", () => {
		const config: MergedLauncherConfig = {
			templates: [{ name: "default", text: "", scope: "app" }],
			profiles: [{ name: "fast", command: "", scope: "app" }],
			skills: [
				{ name: "lint", command: "lint", scope: "app", order: 0 },
				{ name: "test", command: "test", scope: "app", order: 1 },
			],
			shortcuts: [],
			columnDefaults: {
				todo: {
					templateName: "custom",
					profileName: "slow",
					checkedSkills: ["lint"],
					skillOrder: ["test", "lint"],
					lastLayer: "launcher",
				},
			},
			worktreeRootPath: null,
			boardId: null,
			conflictResolutionPrompt: "",
		} as unknown as MergedLauncherConfig;

		const ticket: TicketInfo = {
			number: "1",
			title: "Test ticket",
			status: "todo",
			folderName: "001-test-ticket",
			contextNames: [],
			useWorktree: false,
			fileNames: [],
			references: [],
		};

		createRoot((dispose) => {
			const ctrl = createAgentLauncherController({
				projectSlug: "my-project",
				ticket,
				config,
				onDefaultsChange: () => {},
				useWorktree: false,
			});

			expect(ctrl.selectedTemplate()).toBe("custom");
			expect(ctrl.selectedProfile()).toBe("slow");
			expect(ctrl.checkedSkills()).toEqual(new Set(["lint"]));
			expect(ctrl.orderedSkills().map(s => s.name)).toEqual(["test", "lint"]);

			dispose();
		});
	});
});
