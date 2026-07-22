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
import { TicketColumn, OrphanColumn } from "./kanban-columns.js";
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
			<div
				class="min-h-0 flex-1 overflow-auto px-4"
				style={{ "scrollbar-gutter": "stable" }}
			>
				<div class="flex min-h-full divide-x divide-border">
					<For each={props.board.columns}>
						{(column, i) => (
							<TicketColumn
								column={column}
								edgeLeft={i() === 0}
								edgeRight={
									i() === props.board.columns.length - 1
									&& board().orphanedTickets.length === 0
								}
								tickets={resolveTicketsForColumn(
									column.name, currentOrder(),
									board().ticketMap,
									board().orphanFolderNames,
								)}
								registerRef={(el) =>
									commands.registerColumnRef(
										column.name, el,
									)
								}
								activeId={drag().activeId}
								activeTicket={activeTicket()}
								hoverTarget={drag().hoverTarget}
								columns={props.board.columns}
								onDelete={props.onDelete}
								onArchive={props.onArchive}
								onViewDetail={props.onViewDetail}
							/>
						)}
					</For>
					<Show when={board().orphanedTickets.length > 0}>
						<OrphanColumn
							tickets={board().orphanedTickets}
							activeId={drag().activeId}
							activeTicket={activeTicket()}
							hoverTarget={drag().hoverTarget}
							columns={props.board.columns}
							onDelete={props.onDelete}
							onArchive={props.onArchive}
							onViewDetail={props.onViewDetail}
						/>
					</Show>
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
									columns={props.board.columns}
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
