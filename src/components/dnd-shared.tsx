import type { JSX } from "solid-js";

// Shared drag-and-drop visual language, used by both the KanbanBoard (ticket
// reorder) and LauncherSettings (column reorder). The DnD algorithms differ,
// but the look — faded source, tilted floating overlay, ghost drop preview —
// is the same.

// Applied to the source item while it is being dragged: fades it in place
// instead of removing it from the layout.
export const DND_ACTIVE_CLASS = "opacity-30";

// The floating card that follows the cursor inside a DragOverlay.
export const DND_OVERLAY_CLASS = "rotate-2 scale-95 opacity-80 shadow-xl";

// The ghost preview rendered at the drop target slot.
export const DND_PREVIEW_CLASS = "pointer-events-none opacity-40";

function cx(base: string, extra?: string): string {
	return extra ? `${base} ${extra}` : base;
}

// Ghost preview shown where the dragged item will land. data-drop-preview marks
// it so drag-position math can exclude it; data-drop-indicator lets tests detect
// its presence.
export function DragPreview(props: { class?: string; children: JSX.Element }) {
	return (
		<div data-drop-indicator data-drop-preview class={cx(DND_PREVIEW_CLASS, props.class)}>
			{props.children}
		</div>
	);
}

// Floating representation of the dragged item, rendered inside a DragOverlay.
export function DragOverlayCard(props: { class?: string; style?: JSX.CSSProperties; children: JSX.Element }) {
	return (
		<div class={cx(DND_OVERLAY_CLASS, props.class)} style={props.style}>
			{props.children}
		</div>
	);
}
