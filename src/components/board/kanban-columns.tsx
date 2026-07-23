import { For, Show } from "solid-js";
import {
	SortableProvider,
	createSortable,
	createDroppable,
} from "@thisbeyond/solid-dnd";
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
}) {
	const id = makeId(props.column, props.ticket.folderName);
	const sortable = createSortable(id);
	const isActive = () => props.activeId === id;

	return (
		<div
			ref={sortable.ref}
			data-sortable-id={id}
			classList={{ [DND_ACTIVE_CLASS]: isActive() }}
			{...sortable.dragActivators}
		>
			<TicketCard
				ticket={props.ticket}
				orphanedStatus={props.orphanedStatus}
				onDelete={props.onDelete}
				onArchive={props.onArchive}
				onViewDetail={props.onViewDetail}
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
}

export function TicketColumn(props: TicketColumnProps & {
	column: ColumnDefinition;
	tickets: TicketInfo[];
	registerRef: (el: HTMLDivElement) => void;
	edgeLeft?: boolean;
	edgeRight?: boolean;
}) {
	const ids = () => props.tickets.map((t) => makeId(props.column.name, t.folderName));
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
		<div class="flex min-w-[250px] flex-1 flex-col px-4">
			<div class="sticky top-0 bg-background">
				<div
					classList={{
						"mb-3 h-2": true,
						"-ml-8": props.edgeLeft,
						"-ml-4": !props.edgeLeft,
						"-mr-8": props.edgeRight,
						"-mr-4": !props.edgeRight,
					}}
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
					<span class="label-mono text-xs text-muted-foreground">[{props.tickets.length}]</span>
				</div>
				<Show when={props.column.description}>
					<p class="-mt-3 mb-5 text-xs text-muted-foreground" data-testid="kanban-board-column-description">
						{props.column.description}
					</p>
				</Show>
			</div>
			<SortableProvider ids={ids()}>
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
			</SortableProvider>
		</div>
	);
}

export function OrphanColumn(props: TicketColumnProps & { tickets: TicketInfo[] }) {
	return (
		<div
			class={
				"flex min-w-[250px] flex-1 flex-col rounded-md "
				+ "border border-destructive p-3"
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
			<SortableProvider ids={props.tickets.map((t) => makeId("undefined", t.folderName))}>
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
								orphanedStatus={ticket.status}
							/>
						)}
					</For>
				</div>
			</SortableProvider>
		</div>
	);
}
