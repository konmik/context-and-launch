import { For, Show, createSignal, useContext } from "solid-js";
import { revalidate } from '@solidjs/router';
import { TicketOrderContext } from './ticket-order-storage.js';
import { ticketMutationRevalidateKeys } from '../shared/revalidate-keys.js';
import {
	DragDropProvider,
	DragOverlay,
} from "~/components/drag/drag-provider.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { BoardState } from "~/components/project/project-api.js";
import TicketCard from "../ticket/TicketCard";
import { DragOverlayCard } from "./dnd-shared.js";
import { ColumnHeader, ColumnBody, OrphanHeader, OrphanBody } from "./kanban-columns.js";
import { resolveTicketsForColumn, type DropResult } from "./board-logic.js";
import { moveTicketInOrder } from '~/core/ticket/ticket-order-data.js';
import { createBoardDnd } from "./board-state.js";
import type { Accessor } from "solid-js";
import type { DragState } from "./board-state.js";
import { openTicketFolder, updateTicket } from "../ticket/ticket-api.js";

interface KanbanBoardProps {
	board: BoardState;
	projectSlug: string;
	onDelete: (ticket: TicketInfo) => void;
	onArchive: (ticket: TicketInfo) => void;
	onViewDetail: (ticket: TicketInfo) => void;
	onReviewChanges?: (ticket: TicketInfo) => void;
	dragState?: Accessor<DragState>;
	activeTicket?: Accessor<TicketInfo | null>;
}

export default function KanbanBoard(props: KanbanBoardProps) {
	const order = useContext(TicketOrderContext)!;
	const [saveError, setSaveError] = createSignal<string>();
	const dnd = createBoardDnd(() => ({ ...props.board, ticketOrder: order.get() }));
	const board = dnd.board;
	const drag = props.dragState ?? dnd.drag;
	const activeTicket = props.activeTicket ?? dnd.activeTicket;
	const commands = dnd.commands;
	async function saveDrop(drop: DropResult) {
		const projectSlug = props.projectSlug;
		setSaveError(undefined);
		if (drop.fromColumn !== drop.toColumn) {
			const status = await updateTicket(projectSlug, drop.folderName, null, null, drop.toColumn);
			if (props.projectSlug !== projectSlug) return;
			if (!status.ok) { setSaveError(status.message); return; }
		}
		const result = await order.update(current => moveTicketInOrder(
			current, drop.folderName, drop.fromColumn, drop.toColumn, drop.newIndex,
		));
		if (result.type === 'Failure') setSaveError(result.error);
		await revalidate(ticketMutationRevalidateKeys);
	}
	const openFolder = (ticket: TicketInfo) => {
		void openTicketFolder(props.projectSlug, ticket.folderName);
	};

	const ticketsFor = (column: string) => resolveTicketsForColumn(
		column, order.get(), board().ticketMap, board().orphanFolderNames,
	);

	let headerRow!: HTMLDivElement;
	let scrollBody!: HTMLDivElement;
	const syncHeaderScroll = () => {
		headerRow.scrollLeft = scrollBody.scrollLeft;
	};

	return (
		<DragDropProvider
			onDragStart={(e) =>
				commands.startDrag(String(e.draggable.id))
			}
			onDragMove={(e) => commands.handleDragMove(e)}
			onDragEnd={() => {
				const drop = commands.endDrag();
				if (drop) void saveDrop(drop);
			}}
		>
			<div class="flex min-h-0 flex-1 flex-col">
				<Show when={saveError()}>{error => <p role="alert" class="px-4 text-destructive">{error()}</p>}</Show>
				<div
					ref={headerRow}
					class="shrink-0 overflow-hidden px-4"
					style={{ "scrollbar-gutter": "stable" }}
				>
					<div class="flex divide-x divide-border">
						<For each={props.board.columns}>
							{(column, i) => (
								<ColumnHeader
									column={column}
									count={ticketsFor(column.name).length}
									edgeLeft={i() === 0}
									edgeRight={
										i() === props.board.columns.length - 1
										&& board().orphanedTickets.length === 0
									}
								/>
							)}
						</For>
						<Show when={board().orphanedTickets.length > 0}>
							<OrphanHeader />
						</Show>
					</div>
				</div>
				<div
					ref={scrollBody}
					class="min-h-0 flex-1 overflow-auto px-4"
					style={{ "scrollbar-gutter": "stable" }}
					data-testid="kanban-board-scroll"
					onScroll={syncHeaderScroll}
				>
					<div class="flex min-h-full divide-x divide-border">
						<For each={props.board.columns}>
							{(column) => (
								<ColumnBody
									column={column}
									tickets={ticketsFor(column.name)}
									registerRef={(el) =>
										commands.registerColumnRef(
											column.name, el,
										)
									}
									activeId={drag().activeId}
									activeTicket={activeTicket()}
									hoverTarget={drag().hoverTarget}
									onDelete={props.onDelete}
									onArchive={props.onArchive}
									onViewDetail={props.onViewDetail}
									onOpenFolder={openFolder}
									onReviewChanges={props.onReviewChanges ?? (() => {})}
								/>
							)}
						</For>
						<Show when={board().orphanedTickets.length > 0}>
							<OrphanBody
								tickets={board().orphanedTickets}
								activeId={drag().activeId}
								activeTicket={activeTicket()}
								hoverTarget={drag().hoverTarget}
								onDelete={props.onDelete}
								onArchive={props.onArchive}
								onViewDetail={props.onViewDetail}
								onOpenFolder={openFolder}
								onReviewChanges={props.onReviewChanges ?? (() => {})}
							/>
						</Show>
					</div>
				</div>
			</div>
			<DragOverlay>
				{() => (
					<Show when={activeTicket()}>
						{(t) => (
							<DragOverlayCard
								style={{ width: "250px" }}
							>
								<TicketCard
									ticket={t()}
									onDelete={() => {}}
									onArchive={() => {}}
									onViewDetail={() => {}}
									onReviewChanges={() => {}}
								/>
							</DragOverlayCard>
						)}
					</Show>
				)}
			</DragOverlay>
		</DragDropProvider>
	);
}
