import { For, Show } from "solid-js";
import {
	createSortable,
	createDroppable,
} from "~/components/drag/drag-provider.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";
import TicketCard from "../ticket/TicketCard";
import { type HoverTarget, resolvePreviewInsertBefore } from "./drop-index.js";
import { DragPreview, DND_ACTIVE_CLASS } from "./dnd-shared.js";
import { parseId, makeId, COLUMN_PREFIX } from "./kanban-id.js";

function DropPreview(props: { ticket: TicketInfo }) {
	return (
		<DragPreview>
			<TicketCard
				ticket={props.ticket}
				onDelete={() => {}}
				onArchive={() => {}}
				onViewDetail={() => {}}
				onReviewChanges={() => {}}
			/>
		</DragPreview>
	);
}

function SortableTicketCard(props: {
	ticket: TicketInfo;
	column: string;
	activeId: string | null;
	orphanedStatus?: string;
	onDelete: (ticket: TicketInfo) => void;
	onArchive: (ticket: TicketInfo) => void;
	onViewDetail: (ticket: TicketInfo) => void;
	onReviewChanges: (ticket: TicketInfo) => void;
}) {
	const id = makeId(props.column, props.ticket.folderName);
	const sortable = createSortable(id);
	const isActive = () => props.activeId === id;

	return (
		<div
			ref={sortable.ref}
			data-sortable-id={id}
			role="button"
			tabindex="0"
			aria-label={`Drag ticket ${props.ticket.number} to reorder`}
			class={isActive() ? DND_ACTIVE_CLASS : undefined}
			{...sortable.dragActivators}
		>
			<TicketCard
				ticket={props.ticket}
				orphanedStatus={props.orphanedStatus}
				onDelete={props.onDelete}
				onArchive={props.onArchive}
				onViewDetail={props.onViewDetail}
				onReviewChanges={props.onReviewChanges}
			/>
		</div>
	);
}

function EmptyColumnDropzone(props: { column: string }) {
	const droppable = createDroppable(COLUMN_PREFIX + props.column);
	return (
		<div
			ref={droppable.ref}
			class="flex-1"
			data-testid="kanban-board-empty-dropzone"
			data-column-name={props.column}
		/>
	);
}

export interface TicketColumnProps {
	activeId: string | null;
	activeTicket: TicketInfo | null;
	hoverTarget: HoverTarget | null;
	onDelete: (ticket: TicketInfo) => void;
	onArchive: (ticket: TicketInfo) => void;
	onViewDetail: (ticket: TicketInfo) => void;
	onReviewChanges: (ticket: TicketInfo) => void;
}

const COLUMN_CELL_CLASS = "flex min-w-[250px] flex-1 flex-col px-4";

export function ColumnHeader(props: {
	column: ColumnDefinition;
	count: number;
	edgeLeft?: boolean;
	edgeRight?: boolean;
}) {
	return (
		<div
			class={COLUMN_CELL_CLASS}
			data-testid="kanban-board-column-header-cell"
			data-column-name={props.column.name}
		>
			<div
				class={`mb-3 h-2 ${props.edgeLeft ? "-ml-8" : "-ml-4"} ${props.edgeRight ? "-mr-8" : "-mr-4"}`}
				style={{ "background-color": props.column.color ?? "transparent" }}
				data-testid="kanban-board-column-color-line"
				data-column-name={props.column.name}
			/>
			<div class="mb-3 flex items-center gap-2">
				<h3
					class="label-mono text-sm font-semibold text-foreground"
					data-testid="kanban-board-column-header"
					data-column-name={props.column.name}
				>
					{props.column.name}
				</h3>
				<span class="label-mono text-xs text-muted-foreground">[{props.count}]</span>
			</div>
			<Show when={props.column.description}>
				<p class="-mt-3 mb-5 text-xs text-muted-foreground" data-testid="kanban-board-column-description">
					{props.column.description}
				</p>
			</Show>
		</div>
	);
}

export function ColumnBody(props: TicketColumnProps & {
	column: ColumnDefinition;
	tickets: TicketInfo[];
	registerRef: (el: HTMLDivElement) => void;
}) {
	const sourceIndexInColumn = () => {
		const aid = props.activeId;
		if (!aid) return null;
		const { column, folderName } = parseId(aid);
		if (column !== props.column.name) return null;
		const idx = props.tickets.findIndex((t) => t.folderName === folderName);
		return idx === -1 ? null : idx;
	};
	const previewAt = () =>
		resolvePreviewInsertBefore(
			props.hoverTarget, props.column.name, sourceIndexInColumn(),
		);
	return (
		<div
			class={COLUMN_CELL_CLASS}
			data-testid="kanban-board-column-body"
			data-column-name={props.column.name}
		>
			<div ref={(el) => props.registerRef(el)} class="flex flex-1 flex-col gap-2 pb-4">
				<For each={props.tickets}>
					{(ticket, i) => (
						<>
							<Show when={previewAt() === i() && props.activeTicket}>
								{(t) => <DropPreview ticket={t()} />}
							</Show>
							<SortableTicketCard
								ticket={ticket}
								column={props.column.name}
								activeId={props.activeId}
								onDelete={props.onDelete}
								onArchive={props.onArchive}
								onViewDetail={props.onViewDetail}
								onReviewChanges={props.onReviewChanges}
							/>
						</>
					)}
				</For>
				<Show when={previewAt() === props.tickets.length && props.activeTicket}>
					{(t) => <DropPreview ticket={t()} />}
				</Show>
				<Show when={props.tickets.length === 0}>
					<EmptyColumnDropzone column={props.column.name} />
				</Show>
			</div>
		</div>
	);
}

export function OrphanHeader() {
	return (
		<div
			class={
				"flex min-w-[250px] flex-1 flex-col rounded-t-md "
				+ "border border-b-0 border-destructive px-3 pt-3"
			}
			data-testid="kanban-board-undefined-column"
		>
			<h3 class="label-mono mb-1 text-sm font-semibold text-destructive">
				undefined
			</h3>
			<p
				class="mb-2 text-xs text-destructive/80"
				data-testid="kanban-board-undefined-column-description"
			>Update manually</p>
		</div>
	);
}

export function OrphanBody(props: TicketColumnProps & { tickets: TicketInfo[] }) {
	return (
		<div
			class={
				"flex min-w-[250px] flex-1 flex-col rounded-b-md "
				+ "border border-t-0 border-destructive px-3 pb-3"
			}
			data-testid="kanban-board-column-body"
			data-column-name="undefined"
		>
			<div class="flex flex-1 flex-col gap-2">
				<For each={props.tickets}>
					{(ticket) => (
						<SortableTicketCard
							ticket={ticket}
							column="undefined"
							activeId={props.activeId}
							onDelete={props.onDelete}
							onArchive={props.onArchive}
							onViewDetail={props.onViewDetail}
							onReviewChanges={props.onReviewChanges}
							orphanedStatus={ticket.status}
						/>
					)}
				</For>
			</div>
		</div>
	);
}
