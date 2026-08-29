import { describe, expect, it } from "vitest";
import { createRoot, flush } from "solid-js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

import { createProjectPageController } from "./project-page-controller.js";

function ticket(): TicketInfo {
	return {
		number: "T-1",
		title: "Alpha",
		status: "todo",
		folderName: "t-1-alpha",
		contextNames: [],
		useWorktree: false,
		hasAgentWorktree: false,
		fileNames: [],
		references: [],
	};
}

describe("ProjectPageController ticket detail", () => {
	it("selects the clicked ticket without waiting for project refresh", () => {
		const clicked = ticket();
		const { controller, dispose } = createRoot((dispose) => ({
			controller: createProjectPageController({
				projectSlug: () => "test-project",
				data: () => ({
					status: "loaded",
					projects: [],
					projectSlug: "test-project",
					projectPath: "/repo",
					suggestedNextNumber: null,
					board: { columns: [], tickets: [clicked], ticketOrder: {} },
				}),
				runSyncTickets: () => new Promise(() => {}),
			}),
			dispose,
		}));

		void controller.commands.openDetail(clicked);
		flush();

		expect(controller.selectionState().detailTicket).toBe(clicked);
		dispose();
	});

	it("selects a worktree ticket for review", () => {
		const clicked = { ...ticket(), hasAgentWorktree: true };
		const { controller, dispose } = createRoot((dispose) => ({
			controller: createProjectPageController({
				projectSlug: () => "test-project",
				data: () => ({
					status: "loaded",
					projects: [],
					projectSlug: "test-project",
					projectPath: "/repo",
					suggestedNextNumber: null,
					board: { columns: [], tickets: [clicked], ticketOrder: {} },
				}),
				runSyncTickets: () => new Promise(() => {}),
			}),
			dispose,
		}));

		controller.commands.openReview(clicked);
		flush();

		expect(controller.selectionState().reviewTicket).toBe(clicked);
		dispose();
	});
});
