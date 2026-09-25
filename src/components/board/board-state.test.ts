import { describe, it, expect } from "vitest";
import { createRoot, createSignal, flush, runWithOwner } from "solid-js";
import { createBoardDnd } from "./board-state";
import type { BoardState } from "~/components/project/project-api.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";

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

function makeBoard(
	tickets: TicketInfo[],
	columns: ColumnDefinition[] = [{ name: "todo" }, { name: "done" }],
): BoardState {
	const colNames = columns.map(c => c.name);
	const ticketOrder: Record<string, string[]> = {};
	for (const col of colNames) {
		ticketOrder[col] = tickets
			.filter(t => t.status === col)
			.map(t => t.folderName);
	}
	return { columns, tickets, ticketOrder };
}

function invoke<T>(fn: () => T): T {
	const result = runWithOwner(null, fn);
	flush();
	return result;
}

describe("createBoardDnd board view", () => {
	it("computes ticketMap from board tickets", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "done" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { board } = createBoardDnd(b);
			expect(board().ticketMap.size).toBe(2);
			expect(board().ticketMap.get("t-1-alpha")?.status).toBe("todo");
			dispose();
		});
	});

	it("computes orphanedTickets for tickets with no matching column", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "deleted-col" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { board } = createBoardDnd(b);
			expect(board().orphanedTickets.map(t => t.folderName))
				.toEqual(["t-2-bravo"]);
			dispose();
		});
	});

	it("computes orphanFolderNames as a set", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "gone" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { board } = createBoardDnd(b);
			expect(board().orphanFolderNames.has("t-1-alpha")).toBe(true);
			dispose();
		});
	});
});

describe("createBoardDnd drag state", () => {
	it("initial drag state is idle", () => {
		createRoot(dispose => {
			const [b] = createSignal(makeBoard([]));
			const { drag, activeTicket } = createBoardDnd(b);
			expect(drag().activeId).toBeNull();
			expect(drag().hoverTarget).toBeNull();
			expect(activeTicket()).toBeNull();
			dispose();
		});
	});

	it("startDrag sets activeId", () => {
		createRoot(dispose => {
			const tickets = [makeTicket({ folderName: "t-1-alpha", status: "todo" })];
			const [b] = createSignal(makeBoard(tickets));
			const { drag, activeTicket, commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			expect(drag().activeId).toBe("todo:t-1-alpha");
			expect(activeTicket()?.folderName).toBe("t-1-alpha");
			dispose();
		});
	});

	it("cancelDrag clears activeId and hoverTarget", () => {
		createRoot(dispose => {
			const tickets = [makeTicket({ folderName: "t-1-alpha", status: "todo" })];
			const [b] = createSignal(makeBoard(tickets));
			const { drag, commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "done", index: 0 }));
			invoke(commands.cancelDrag);
			expect(drag().activeId).toBeNull();
			expect(drag().hoverTarget).toBeNull();
			dispose();
		});
	});
});

describe("createBoardDnd endDrag", () => {
	it("returns DropResult for cross-column drag", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "done" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "done", index: 1 }));
			expect(invoke(commands.endDrag)).toEqual({
				folderName: "t-1-alpha",
				fromColumn: "todo",
				toColumn: "done",
				newIndex: 1,
			});
			dispose();
		});
	});

	it("returns DropResult for same-column reorder", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "todo" }),
				makeTicket({ folderName: "t-3-charlie", status: "todo" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "todo", index: 2 }));
			expect(invoke(commands.endDrag)).toEqual({
				folderName: "t-1-alpha",
				fromColumn: "todo",
				toColumn: "todo",
				newIndex: 2,
			});
			dispose();
		});
	});

	it("returns null for same-position drop", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "todo" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "todo", index: 0 }));
			expect(invoke(commands.endDrag)).toBeNull();
			dispose();
		});
	});

	it("returns null when no hoverTarget", () => {
		createRoot(dispose => {
			const tickets = [makeTicket({ folderName: "t-1-alpha", status: "todo" })];
			const [b] = createSignal(makeBoard(tickets));
			const { commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			expect(invoke(commands.endDrag)).toBeNull();
			dispose();
		});
	});

	it("rejects drop into undefined column", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "gone" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "undefined", index: 0 }));
			expect(invoke(commands.endDrag)).toBeNull();
			dispose();
		});
	});

	it("clears drag state after drop", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "done" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { drag, commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "done", index: 0 }));
			invoke(commands.endDrag);
			expect(drag().activeId).toBeNull();
			expect(drag().hoverTarget).toBeNull();
			dispose();
		});
	});

	it("leaves persisted order with its owner after drop", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "done" }),
			];
			const [b] = createSignal(makeBoard(tickets));
			const { currentOrder, commands } = createBoardDnd(b);
			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "done", index: 1 }));
			invoke(commands.endDrag);
			expect(currentOrder()["todo"]).toEqual(["t-1-alpha"]);
			expect(currentOrder()["done"]).toEqual(["t-2-bravo"]);
			dispose();
		});
	});
});

describe("createBoardDnd server sync", () => {
	it("reads replacement ticket order", () => {
		createRoot(dispose => {
			const tickets = [
				makeTicket({ folderName: "t-1-alpha", status: "todo" }),
				makeTicket({ folderName: "t-2-bravo", status: "done" }),
				makeTicket({ folderName: "t-3-charlie", status: "done" }),
			];
			const [b, setB] = createSignal(makeBoard(tickets));
			const { currentOrder, commands } = createBoardDnd(b);

			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "done", index: 0 }));
			invoke(commands.endDrag);
			expect(currentOrder()["done"])
				.toEqual(["t-2-bravo", "t-3-charlie"]);

			const serverOrder = {
				todo: [],
				done: ["t-3-charlie", "t-1-alpha", "t-2-bravo"],
			};
			invoke(() => setB({
				columns: b().columns,
				tickets: b().tickets,
				ticketOrder: serverOrder,
			}));

			expect(currentOrder()["done"])
				.toEqual(["t-3-charlie", "t-1-alpha", "t-2-bravo"]);
			dispose();
		});
	});

	it("new tickets appear after server sync", () => {
		createRoot(dispose => {
			const ticketA = makeTicket({ folderName: "t-1-alpha", status: "todo" });
			const ticketB = makeTicket({ folderName: "t-2-bravo", status: "done" });
			const [b, setB] = createSignal(makeBoard([ticketA, ticketB]));
			const { board, commands } = createBoardDnd(b);

			invoke(() => commands.startDrag("todo:t-1-alpha"));
			invoke(() => commands.updateHover({ column: "done", index: 0 }));
			invoke(commands.endDrag);

			const ticketC = makeTicket({ folderName: "t-3-charlie", status: "todo" });
			invoke(() => setB(makeBoard([ticketA, ticketB, ticketC])));

			expect(board().ticketMap.has("t-3-charlie")).toBe(true);
			dispose();
		});
	});
});
