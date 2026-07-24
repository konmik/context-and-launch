import { For, Show } from "solid-js";
import {
	DragDropProvider,
	DragDropSensors,
	DragOverlay,
	closestCenter,
} from "@thisbeyond/solid-dnd";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { BoardState } from "~/components/project/project-api.js";
import TicketCard from "../ticket/TicketCard";
import { DragOverlayCard } from "./dnd-shared.js";
import { ColumnHeader, ColumnBody, OrphanHeader, OrphanBody } from "./kanban-columns.js";
import { resolveTicketsForColumn } from "./board-logic.js";
import { createBoardDnd, type BoardCommands } from "./board-state.js";
import type { Accessor } from "solid-js";
import type { BoardView, DragState } from "./board-state.js";

interface KanbanBoardProps {
	board: BoardState;
	projectSlug: string;
	onDelete: (ticket: TicketInfo) => void;
	onArchive: (ticket: TicketInfo) => void;
	onViewDetail: (ticket: TicketInfo) => void;
	onReorder: (
		folderName: string, fromColumn: string,
		toColumn: string, newIndex: number,
	) => void;
	boardView?: Accessor<BoardView>;
	dragState?: Accessor<DragState>;
	currentOrder?: Accessor<Record<string, string[]>>;
	activeTicket?: Accessor<TicketInfo | null>;
	commands?: BoardCommands;
}

export default function KanbanBoard(props: KanbanBoardProps) {
	const dnd = createBoardDnd(() => props.board);
	const board = props.boardView ?? dnd.board;
	const drag = props.dragState ?? dnd.drag;
	const currentOrder = props.currentOrder ?? dnd.currentOrder;
	const activeTicket = props.activeTicket ?? dnd.activeTicket;
	const commands = props.commands ?? dnd.commands;

	const ticketsFor = (column: string) => resolveTicketsForColumn(
		column, currentOrder(), board().ticketMap, board().orphanFolderNames,
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
				if (drop) {
					props.onReorder(
						drop.folderName, drop.fromColumn,
						drop.toColumn, drop.newIndex,
					);
				}
			}}
			collisionDetector={closestCenter}
		>
			<DragDropSensors />
			<div class="flex min-h-0 flex-1 flex-col">
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
								/>
							</DragOverlayCard>
						)}
					</Show>
				)}
			</DragOverlay>
		</DragDropProvider>
	);
}
