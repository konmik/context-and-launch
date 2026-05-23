import { For, createSignal } from "solid-js";
import type { TicketInfo, BoardState } from "~/types.js";
import TicketCard from "./TicketCard";

interface KanbanBoardProps {
  board: BoardState;
  slug: string;
  onEdit: (ticket: TicketInfo) => void;
  onDelete: (ticket: TicketInfo) => void;
  onViewDetail: (ticket: TicketInfo) => void;
  onMoveTo: (ticket: TicketInfo, status: string) => void;
}

export default function KanbanBoard(props: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = createSignal<string | null>(null);
  const [dragging, setDragging] = createSignal(false);

  function ticketsForColumn(column: string): TicketInfo[] {
    return props.board.tickets
      .filter((t) => t.status === column)
      .sort((a, b) =>
        a.number.toLowerCase().localeCompare(b.number.toLowerCase())
      );
  }

  function handleDragStart(e: DragEvent, ticket: TicketInfo) {
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("application/json", JSON.stringify(ticket));
    requestAnimationFrame(() => setDragging(true));
  }

  function handleDragEnd() {
    setDragOverColumn(null);
    setDragging(false);
  }

  function handleDrop(e: DragEvent, targetColumn: string) {
    e.preventDefault();
    setDragOverColumn(null);
    setDragging(false);
    try {
      const data = e.dataTransfer!.getData("application/json");
      const ticket = JSON.parse(data) as TicketInfo;
      if (ticket.status !== targetColumn) {
        props.onMoveTo(ticket, targetColumn);
      }
    } catch {
      // swallow
    }
  }

  return (
    <div
      class="flex gap-4 overflow-x-auto p-4"
      style={{ "min-height": "calc(100vh - 80px)" }}
    >
      <For each={props.board.columns}>
        {(column) => (
          <div
            class={`flex min-w-[250px] flex-1 flex-col rounded-lg p-3 transition-colors ${
              dragOverColumn() === column
                ? "bg-accent/50 ring-2 ring-ring"
                : "bg-muted/50"
            }`}
            onDragEnter={() => setDragOverColumn(column)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragOverColumn(null);
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = "move"; }}
            onDrop={(e) => handleDrop(e, column)}
          >
            <div class={dragging() ? "pointer-events-none" : ""}>
              <h3 class="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                {column}
              </h3>
              <div class="flex flex-col gap-2">
                <For each={ticketsForColumn(column)}>
                  {(ticket) => (
                    <div
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, ticket)}
                      onDragEnd={handleDragEnd}
                    >
                      <TicketCard
                        ticket={ticket}
                        columns={props.board.columns}
                        onEdit={props.onEdit}
                        onDelete={props.onDelete}
                        onViewDetail={props.onViewDetail}
                        onMoveTo={props.onMoveTo}
                      />
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
