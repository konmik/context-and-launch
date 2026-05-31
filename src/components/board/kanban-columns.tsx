import { For, Show, type JSX } from "solid-js";
import {
	SortableProvider,
	createSortable,
	createDroppable,
} from "@thisbeyond/solid-dnd";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ColumnDefinition } from "~/server/project/board-config.js";
import TicketCard from "../ticket/TicketCard";
import type { HoverTarget } from "./drop-index.js";
import { DragPreview, DND_ACTIVE_CLASS } from "./dnd-shared.js";
import { parseId, makeId, COLUMN_PREFIX } from "./kanban-id.js";

function DropPreview(props: { ticket: TicketInfo }) {
	return (
		<DragPreview>
			<TicketCard
				ticket={props.ticket}
				onEdit={() => {}}
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
	index: number;
	activeId: string | null;
	activeTicket: TicketInfo | null;
	hoverTarget: HoverTarget | null;
	orphanedStatus?: string;
	onEdit: (ticket: TicketInfo) => void;
	onDelete: (ticket: TicketInfo) => void;
	onArchive: (ticket: TicketInfo) => void;
	onViewDetail: (ticket: TicketInfo) => void;
}) {
	const id = makeId(props.column, props.ticket.folderName);
	const sortable = createSortable(id);
	const isActive = () => props.activeId === id;
	const isCrossColumn = () => {
		const aid = props.activeId;
		return aid !== null && parseId(aid).column !== props.column;
	};
	const showIndicator = () =>
		isCrossColumn() &&
		!isActive() &&
		props.hoverTarget !== null &&
		props.hoverTarget.column === props.column &&
		props.hoverTarget.index === props.index;

	return (
		<div
			ref={sortable.ref}
			data-sortable-id={id}
			class="flex flex-col gap-2"
			classList={{ [DND_ACTIVE_CLASS]: isActive() }}
			style={{
				...(sortable.transform ? {
					transform: `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`,
				} : {}),
			}}
			{...sortable.dragActivators}
		>
			<Show when={showIndicator() && props.activeTicket}>
				{(t) => <DropPreview ticket={t()} />}
			</Show>
			<TicketCard
				ticket={props.ticket}
				orphanedStatus={props.orphanedStatus}
				onEdit={props.onEdit}
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
	onEdit: (ticket: TicketInfo) => void;
	onDelete: (ticket: TicketInfo) => void;
	onArchive: (ticket: TicketInfo) => void;
	onViewDetail: (ticket: TicketInfo) => void;
}

export function TicketColumn(props: TicketColumnProps & {
	column: ColumnDefinition;
	tickets: TicketInfo[];
	registerRef: (el: HTMLDivElement) => void;
}) {
	const ids = () => props.tickets.map((t) => makeId(props.column.name, t.folderName));
	const tailPreview = () => {
		const h = props.hoverTarget;
		const aid = props.activeId;
		if (!h || !aid || h.column !== props.column.name || h.index !== props.tickets.length) return false;
		return parseId(aid).column !== props.column.name;
	};
	return (
		<div class="flex min-w-[250px] flex-1 flex-col rounded-lg bg-muted/50 p-3">
			<h3
				class="mb-3 text-sm font-semibold uppercase text-muted-foreground"
				data-testid="kanban-board-column-header"
				data-column-name={props.column.name}
			>
				{props.column.name}
			</h3>
			<Show when={props.column.description}>
				<p class="mb-2 text-xs text-muted-foreground" data-testid="kanban-board-column-description">
					{props.column.description}
				</p>
			</Show>
			<SortableProvider ids={ids()}>
				<div ref={(el) => props.registerRef(el)} class="flex flex-1 flex-col gap-2">
					<For each={props.tickets}>
						{(ticket, i) => (
							<SortableTicketCard
								ticket={ticket}
								column={props.column.name}
								index={i()}
								activeId={props.activeId}
								activeTicket={props.activeTicket}
								hoverTarget={props.hoverTarget}
								onEdit={props.onEdit}
								onDelete={props.onDelete}
								onArchive={props.onArchive}
								onViewDetail={props.onViewDetail}
							/>
						)}
					</For>
					<Show when={tailPreview() && props.activeTicket}>
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
				"flex min-w-[250px] flex-1 flex-col rounded-lg "
				+ "border-2 border-destructive bg-muted/50 p-3"
			}
			data-testid="kanban-board-undefined-column"
		>
			<h3 class="mb-1 text-sm font-semibold uppercase text-destructive">
				undefined
			</h3>
			<p
				class="mb-2 text-xs text-destructive/80"
				data-testid="kanban-board-undefined-column-description"
			>Update manually</p>
			<SortableProvider ids={props.tickets.map((t) => makeId("undefined", t.folderName))}>
				<div class="flex flex-1 flex-col gap-2">
					<For each={props.tickets}>
						{(ticket, i) => (
							<SortableTicketCard
								ticket={ticket}
								column="undefined"
								index={i()}
								activeId={props.activeId}
								activeTicket={props.activeTicket}
								hoverTarget={props.hoverTarget}
								onEdit={props.onEdit}
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
