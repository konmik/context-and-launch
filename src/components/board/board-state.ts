import { createSignal, createMemo, type Accessor } from "solid-js";
import type { DragEvent as DndDragEvent } from "@thisbeyond/solid-dnd";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { BoardState } from "~/components/project/project-api.js";
import type { HoverTarget } from "./drop-index.js";
import {
	type DropResult,
	buildTicketMap,
	computeOrphans,
	resolveActiveTicket,
	resolveTicketsForColumn,
	resolveDrop,
	applyDrop,
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

export interface BoardCommands {
	startDrag: (id: string) => void;
	updateHover: (target: HoverTarget | null) => void;
	handleDragMove: (event: DndDragEvent) => void;
	endDrag: () => DropResult | null;
	cancelDrag: () => void;
	registerColumnRef: (columnName: string, el: HTMLDivElement) => void;
}

interface OrderOverride {
	order: Record<string, string[]>;
	basedOn: Record<string, string[]>;
}

export interface BoardDnd {
	board: Accessor<BoardView>;
	drag: Accessor<DragState>;
	currentOrder: Accessor<Record<string, string[]>>;
	activeTicket: Accessor<TicketInfo | null>;
	commands: BoardCommands;
}

export function createBoardDnd(getBoard: () => BoardState): BoardDnd {
	const [activeId, setActiveId] = createSignal<string | null>(null);
	const [hoverTarget, setHoverTarget] =
		createSignal<HoverTarget | null>(null);
	const [orderOverride, setOrderOverride] =
		createSignal<OrderOverride | null>(null);
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

	const currentOrder = createMemo(() => {
		const override = orderOverride();
		const base = getBoard().ticketOrder;
		return override && override.basedOn === base
			? override.order : base;
	});

	const activeTicket = createMemo(() =>
		resolveActiveTicket(activeId(), board().ticketMap),
	);

	const cancelDrag = () => {
		setActiveId(null);
		setHoverTarget(null);
	};

	const commands: BoardCommands = {
		startDrag: (id) => setActiveId(id),
		updateHover: (target) => setHoverTarget(target),
		cancelDrag,
		registerColumnRef: (col, el) => columnRefs.set(col, el),

		handleDragMove: (e) => {
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
			if (result) {
				const order = applyDrop(
					currentOrder(), result.fromColumn,
					result.folderName, result.toColumn, result.newIndex,
				);
				setOrderOverride({
					order, basedOn: getBoard().ticketOrder,
				});
			}
			cancelDrag();
			return result;
		},
	};

	return { board, drag, currentOrder, activeTicket, commands };
}
