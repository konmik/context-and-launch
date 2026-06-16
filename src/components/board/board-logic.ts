import type { DragEvent as DndDragEvent } from "@thisbeyond/solid-dnd";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { BoardState } from "~/components/project/project-api.js";
import type { HoverTarget } from "./drop-index.js";
import { computeHoverTarget } from "./drop-index.js";
import { parseId } from "./kanban-id.js";

export interface DropResult {
	folderName: string;
	fromColumn: string;
	toColumn: string;
	newIndex: number;
}

export function buildTicketMap(tickets: TicketInfo[]): Map<string, TicketInfo> {
	const map = new Map<string, TicketInfo>();
	for (const t of tickets) map.set(t.folderName, t);
	return map;
}

export function computeOrphans(board: BoardState): TicketInfo[] {
	const colNames = new Set(board.columns.map(c => c.name));
	return board.tickets.filter(t => !colNames.has(t.status));
}

export function resolveActiveTicket(
	activeId: string | null,
	ticketMap: Map<string, TicketInfo>,
): TicketInfo | null {
	if (!activeId) return null;
	const { folderName } = parseId(activeId);
	return ticketMap.get(folderName) ?? null;
}

export function resolveTicketsForColumn(
	column: string,
	order: Record<string, string[]>,
	ticketMap: Map<string, TicketInfo>,
	orphanFolderNames: Set<string>,
): TicketInfo[] {
	const names = order[column] ?? [];
	const result: TicketInfo[] = [];
	for (const fn of names) {
		if (orphanFolderNames.has(fn)) continue;
		const t = ticketMap.get(fn);
		if (t) result.push(t);
	}
	return result;
}

export function applyDrop(
	order: Record<string, string[]>,
	fromColumn: string,
	folderName: string,
	toColumn: string,
	newIndex: number,
): Record<string, string[]> {
	const updated = { ...order };
	updated[fromColumn] = (updated[fromColumn] ?? [])
		.filter(fn => fn !== folderName);
	updated[toColumn] = [...(updated[toColumn] ?? [])];
	updated[toColumn].splice(newIndex, 0, folderName);
	return updated;
}

export function resolveDrop(
	activeId: string | null,
	hoverTarget: HoverTarget | null,
	currentOrder: Record<string, string[]>,
	ticketMap: Map<string, TicketInfo>,
	orphanFolderNames: Set<string>,
): DropResult | null {
	if (!activeId || !hoverTarget) return null;

	const { column: fromColumn, folderName } = parseId(activeId);
	const { column: toColumn, index: newIndex } = hoverTarget;

	if (toColumn === "undefined") return null;

	if (fromColumn === toColumn) {
		const colTickets = resolveTicketsForColumn(
			toColumn, currentOrder, ticketMap, orphanFolderNames,
		);
		const fromIdx = colTickets.findIndex(t => t.folderName === folderName);
		if (fromIdx === newIndex || fromIdx + 1 === newIndex) return null;
	}

	return { folderName, fromColumn, toColumn, newIndex };
}

export function resolveCursorPosition(
	event: DndDragEvent,
): { x: number; y: number } | null {
	type WithOverlay = DndDragEvent & {
		overlay?: { node?: HTMLElement };
	};
	const overlay = (event as WithOverlay).overlay;
	const node = event.draggable.node;
	if (!node) return null;

	if (overlay?.node) {
		const r = overlay.node.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}
	const rect = node.getBoundingClientRect();
	const t = event.draggable.transform;
	return {
		x: rect.left + rect.width / 2 + (t?.x ?? 0),
		y: rect.top + rect.height / 2 + (t?.y ?? 0),
	};
}

export function collectColumnRects(
	columnRefs: Map<string, HTMLDivElement>,
): {
	colRects: Map<string, { left: number; right: number }>;
	cardRectsByCol: Map<string, { top: number; height: number }[]>;
} {
	const colRects = new Map<string, { left: number; right: number }>();
	const cardRectsByCol = new Map<string, { top: number; height: number }[]>();
	for (const [col, el] of columnRefs) {
		const r = el.getBoundingClientRect();
		colRects.set(col, { left: r.left, right: r.right });
		const cards = el.querySelectorAll<HTMLElement>(
			"[data-drag-source]:not([data-drop-preview] *)",
		);
		const rects: { top: number; height: number }[] = [];
		for (const card of cards) {
			const cr = card.getBoundingClientRect();
			rects.push({ top: cr.top, height: cr.height });
		}
		cardRectsByCol.set(col, rects);
	}
	return { colRects, cardRectsByCol };
}

export function resolveDragSource(
	dragId: string | null,
	order: Record<string, string[]>,
	ticketMap: Map<string, TicketInfo>,
	orphanFolderNames: Set<string>,
): { column: string; index: number } | undefined {
	if (!dragId) return undefined;
	const { column, folderName } = parseId(dragId);
	const tickets = resolveTicketsForColumn(
		column, order, ticketMap, orphanFolderNames,
	);
	const idx = tickets.findIndex(t => t.folderName === folderName);
	return idx !== -1 ? { column, index: idx } : undefined;
}

export function computeDragMoveTarget(
	event: DndDragEvent,
	dragId: string | null,
	columnRefs: Map<string, HTMLDivElement>,
	order: Record<string, string[]>,
	ticketMap: Map<string, TicketInfo>,
	orphanFolderNames: Set<string>,
): HoverTarget | null {
	const cursor = resolveCursorPosition(event);
	if (!cursor) return null;
	const { colRects, cardRectsByCol } = collectColumnRects(columnRefs);
	const dragSource = resolveDragSource(dragId, order, ticketMap, orphanFolderNames);
	return computeHoverTarget(colRects, cardRectsByCol, cursor, dragSource);
}
