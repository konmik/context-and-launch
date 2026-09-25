import { createSignal, createMemo } from "solid-js";
import type { DragEvent as DndDragEvent } from "~/components/drag/drag-types.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { BoardState } from "~/components/project/project-api.js";
import type { HoverTarget } from "./drop-index.js";
import {
	buildTicketMap,
	computeOrphans,
	resolveActiveTicket,
	resolveDrop,
	computeDragMoveTarget,
} from "./board-logic.js";

export type { DropResult } from "./board-logic.js";

export interface BoardView {
	ticketMap: Map<string, TicketInfo>;
	orphanedTickets: TicketInfo[];
	orphanFolderNames: Set<string>;
}

export interface DragState {
	activeId: string | null;
	hoverTarget: HoverTarget | null;
}

export function createBoardDnd(getBoard: () => BoardState) {
	const [activeId, setActiveId] = createSignal<string | null>(null);
	const [hoverTarget, setHoverTarget] =
		createSignal<HoverTarget | null>(null);
	const columnRefs = new Map<string, HTMLDivElement>();

	const board = createMemo((): BoardView => {
		const b = getBoard();
		const ticketMap = buildTicketMap(b.tickets);
		const orphanedTickets = computeOrphans(b);
		const orphanFolderNames = new Set(
			orphanedTickets.map(t => t.folderName),
		);
		return { ticketMap, orphanedTickets, orphanFolderNames };
	});

	const drag = createMemo((): DragState => ({
		activeId: activeId(),
		hoverTarget: hoverTarget(),
	}));

	const currentOrder = () => getBoard().ticketOrder;

	const activeTicket = createMemo(() =>
		resolveActiveTicket(activeId(), board().ticketMap),
	);

	const cancelDrag = () => {
		setActiveId(null);
		setHoverTarget(null);
	};

	const commands = {
		startDrag: (id: string) => setActiveId(id),
		updateHover: (target: HoverTarget | null) => setHoverTarget(target),
		cancelDrag,
		registerColumnRef: (col: string, el: HTMLDivElement) => columnRefs.set(col, el),

		handleDragMove: (e: DndDragEvent) => {
			const { ticketMap, orphanFolderNames } = board();
			setHoverTarget(
				computeDragMoveTarget(
					e, activeId(), columnRefs,
					currentOrder(), ticketMap, orphanFolderNames,
				),
			);
		},

		endDrag: () => {
			const { ticketMap, orphanFolderNames } = board();
			const result = resolveDrop(
				activeId(), hoverTarget(), currentOrder(),
				ticketMap, orphanFolderNames,
			);
			cancelDrag();
			return result;
		},
	};

	return { board, drag, currentOrder, activeTicket, commands };
}
