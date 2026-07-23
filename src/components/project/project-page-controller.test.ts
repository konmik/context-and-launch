import { describe, expect, it, vi } from "vitest";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

const { mockRevalidate } = vi.hoisted(() => ({
	mockRevalidate: vi.fn(),
}));

vi.mock("@solidjs/router", () => ({ revalidate: mockRevalidate }));
vi.mock("../ticket/ticket-api.js", () => ({
	createTicket: vi.fn(),
	deleteTicket: vi.fn(),
	archiveTicket: vi.fn(),
	reorderTicket: vi.fn(),
	syncTickets: vi.fn(),
	worktreeCleanup: vi.fn(),
}));
vi.mock("./project-api.js", () => ({
	deleteProject: vi.fn(),
	getSyncStatus: vi.fn(),
}));
vi.mock("../launcher/launcher-api.js", () => ({
	resolveConflicts: vi.fn(),
	abortRebase: vi.fn(),
}));

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
		mockRevalidate.mockReturnValue(new Promise(() => {}));
		const clicked = ticket();
		const controller = createProjectPageController({
			projectSlug: () => "test-project",
			data: () => ({
				status: "loaded",
				projects: [],
				projectSlug: "test-project",
				projectPath: "/repo",
				suggestedNextNumber: null,
				board: { columns: [], tickets: [clicked], ticketOrder: {} },
			}),
		});

		void controller.commands.openDetail(clicked);

		expect(controller.selectionState().detailTicket).toBe(clicked);
	});
});
