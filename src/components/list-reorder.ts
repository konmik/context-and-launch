import { createSignal, createMemo, type Accessor } from "solid-js";
import type { DragEvent as DndDragEvent } from "@thisbeyond/solid-dnd";

// Fractional sort key for an item dropped between two neighbours, given their
// orders (undefined when the item lands at an end of the list). Picking the
// midpoint means only the moved item's order changes, never its neighbours'.
export function midpointOrder(before: number | undefined, after: number | undefined): number {
	if (before === undefined && after === undefined) return 0;
	if (before === undefined) return after! - 1;
	if (after === undefined) return before + 1;
	return (before + after) / 2;
}

export function orderByNameList<T extends { name: string }>(items: T[], preferredNames: string[]): T[] {
	if (preferredNames.length === 0) return items;
	const rank = new Map(preferredNames.map((name, i) => [name, i]));
	return [...items].sort((a, b) => {
		const ra = rank.get(a.name) ?? Infinity;
		const rb = rank.get(b.name) ?? Infinity;
		return ra === rb ? 0 : ra - rb;
	});
}

export interface ListReorder<T> {
	activeId: Accessor<string | null>;
	dropPreview: Accessor<{ insertBefore: number; item: T } | null>;
	onDragStart: (event: DndDragEvent) => void;
	onDragOver: (event: DndDragEvent) => void;
	onDragEnd: (event: DndDragEvent) => void;
}

// Shared drag-to-reorder state machine for a flat list of uniquely-keyed items.
// Both the column list and the skill list use it; they differ only in how the
// resulting order is persisted (onReorder receives the new id order plus the
// dragged item). The DnD visual language lives in dnd-shared.
export function createListReorder<T>(opts: {
	items: Accessor<T[]>;
	idOf: (item: T) => string;
	onReorder: (orderedIds: string[], dragged: T) => void;
}): ListReorder<T> {
	const [activeId, setActiveId] = createSignal<string | null>(null);
	const [overId, setOverId] = createSignal<string | null>(null);

	// The faded ghost row marking where the dragged item will land.
	const dropPreview = createMemo<{ insertBefore: number; item: T } | null>(() => {
		const list = opts.items();
		const active = activeId();
		const over = overId();
		if (!active || !over || over === active) return null;
		const ids = list.map(opts.idOf);
		const fromIdx = ids.indexOf(active);
		const overIdx = ids.indexOf(over);
		if (fromIdx < 0 || overIdx < 0) return null;
		const insertBefore = fromIdx < overIdx ? overIdx + 1 : overIdx;
		return { insertBefore, item: list[fromIdx] };
	});

	function onDragStart(event: DndDragEvent) {
		setActiveId(String(event.draggable.id));
		setOverId(null);
	}

	function onDragOver(event: DndDragEvent) {
		setOverId(event.droppable ? String(event.droppable.id) : null);
	}

	function onDragEnd(event: DndDragEvent) {
		setActiveId(null);
		setOverId(null);
		const list = opts.items();
		const draggableId = String(event.draggable.id);
		const droppableId = event.droppable?.id;
		if (!droppableId) return;
		const ids = list.map(opts.idOf);
		const fromIdx = ids.indexOf(draggableId);
		const toIdx = ids.indexOf(String(droppableId));
		if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
		const newOrder = [...ids];
		newOrder.splice(fromIdx, 1);
		newOrder.splice(toIdx, 0, draggableId);
		opts.onReorder(newOrder, list[fromIdx]);
	}

	return { activeId, dropPreview, onDragStart, onDragOver, onDragEnd };
}
