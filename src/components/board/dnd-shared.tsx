import { Show, type JSX } from "solid-js";
import { DragOverlay } from "@thisbeyond/solid-dnd";
import { joinClass } from "~/lib/class-util";

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


// Ghost preview shown where the dragged item will land. data-drop-preview marks
// it so drag-position math can exclude it; data-drop-indicator lets tests detect
// its presence.
export function DragPreview(props: { class?: string; children: JSX.Element }) {
	return (
		<div data-drop-indicator data-drop-preview class={joinClass(DND_PREVIEW_CLASS, props.class)}>
			{props.children}
		</div>
	);
}

// Floating representation of the dragged item, rendered inside a DragOverlay.
export function DragOverlayCard(props: { class?: string; style?: JSX.CSSProperties; children: JSX.Element }) {
	return (
		<div class={joinClass(DND_OVERLAY_CLASS, props.class)} style={props.style}>
			{props.children}
		</div>
	);
}

function GripIcon() {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>
	);
}

export function DragGrip(props: { gripProps?: Record<string, unknown>; testId: string }) {
	return (
		<span {...(props.gripProps ?? {})} class="cursor-grab text-muted-foreground" data-testid={props.testId}>
			<GripIcon />
		</span>
	);
}

// The card that floats under the cursor while dragging a row keyed by its name.
// Renders nothing once the id no longer maps to a live item.
export function NameDragOverlay(props: { nameOf: (id: string) => string | undefined }) {
	return (
		<DragOverlay>
			{(draggable) => {
				const name = props.nameOf(String(draggable?.id));
				return (
					<Show when={name}>
						{(n) => (
							<DragOverlayCard class="rounded-md border border-border bg-card px-3 py-2">
								<span class="text-sm font-medium">{n()}</span>
							</DragOverlayCard>
						)}
					</Show>
				);
			}}
		</DragOverlay>
	);
}
