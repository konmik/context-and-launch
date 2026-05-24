import { For, Show, createSignal, createMemo } from "solid-js";
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  createSortable,
  createDroppable,
  closestCenter,
  type Id,
  type DragEvent as DndDragEvent,
} from "@thisbeyond/solid-dnd";
import type { TicketInfo, BoardState } from "~/types.js";
import TicketCard from "./TicketCard";
import { computeHoverTarget, type HoverTarget } from "./drop-index.js";

interface KanbanBoardProps {
  board: BoardState;
  slug: string;
  onEdit: (ticket: TicketInfo) => void;
  onDelete: (ticket: TicketInfo) => void;
  onViewDetail: (ticket: TicketInfo) => void;
  onReorder: (folderName: string, fromColumn: string, toColumn: string, newIndex: number) => void;
}

function parseId(id: Id): { column: string; folderName: string } {
  const str = String(id);
  const sep = str.indexOf(":");
  return { column: str.slice(0, sep), folderName: str.slice(sep + 1) };
}

function makeId(column: string, folderName: string): string {
  return `${column}:${folderName}`;
}

const COLUMN_PREFIX = "column:";

function SortableTicketCard(props: {
  ticket: TicketInfo;
  column: string;
  index: number;
  activeId: string | null;
  hoverTarget: HoverTarget | null;
  onEdit: (ticket: TicketInfo) => void;
  onDelete: (ticket: TicketInfo) => void;
  onViewDetail: (ticket: TicketInfo) => void;
}) {
  const id = makeId(props.column, props.ticket.folderName);
  const sortable = createSortable(id);
  const isActive = () => props.activeId === id;
  const showIndicator = () =>
    !isActive() &&
    props.hoverTarget !== null &&
    props.hoverTarget.column === props.column &&
    props.hoverTarget.index === props.index;

  return (
    <div
      ref={sortable.ref}
      data-sortable-id={id}
      classList={{ "opacity-30": isActive() }}
      style={{
        ...(sortable.transform ? {
          transform: `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`,
        } : {}),
      }}
      {...sortable.dragActivators}
    >
      <Show when={showIndicator()}>
        <div data-drop-indicator class="h-1 rounded-full bg-ring" />
      </Show>
      <TicketCard
        ticket={props.ticket}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        onViewDetail={props.onViewDetail}
      />
    </div>
  );
}

function EmptyColumnPlaceholder(props: { column: string }) {
  const droppable = createDroppable(COLUMN_PREFIX + props.column);
  return (
    <div
      ref={droppable.ref}
      class="flex flex-1 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 p-8 text-sm text-muted-foreground/50"
      classList={{ "border-ring bg-accent/50": droppable.isActiveDroppable }}
    >
      Drop here
    </div>
  );
}

function ColumnDropIndicator(props: { show: boolean }) {
  return (
    <Show when={props.show}>
      <div data-drop-indicator class="h-1 rounded-full bg-ring" />
    </Show>
  );
}

export default function KanbanBoard(props: KanbanBoardProps) {
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [lastDragCenterY, setLastDragCenterY] = createSignal(0);
  const [hoverTarget, setHoverTarget] = createSignal<HoverTarget | null>(null);

  const columnRefs = new Map<string, HTMLDivElement>();

  if (typeof window !== "undefined") {
    (window as any).__kanbanTestHooks = { setHoverTarget };
  }

  const ticketMap = createMemo(() => {
    const map = new Map<string, TicketInfo>();
    for (const t of props.board.tickets) {
      map.set(t.folderName, t);
    }
    return map;
  });

  function ticketsForColumn(column: string): TicketInfo[] {
    const order = props.board.ticketOrder[column] ?? [];
    const map = ticketMap();
    const result: TicketInfo[] = [];
    for (const fn of order) {
      const t = map.get(fn);
      if (t) result.push(t);
    }
    return result;
  }

  function idsForColumn(column: string): string[] {
    return ticketsForColumn(column).map(t => makeId(column, t.folderName));
  }

  function activeTicket(): TicketInfo | null {
    const id = activeId();
    if (!id) return null;
    const { folderName } = parseId(id);
    return ticketMap().get(folderName) ?? null;
  }

  function handleDragStart(event: DndDragEvent) {
    setActiveId(String(event.draggable.id));
  }

  function handleDragMove(event: DndDragEvent) {
    const overlay = (event as any).overlay;
    const node = event.draggable.node;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const transform = event.draggable.transform;

    let cursorX: number, cursorY: number;
    if (overlay?.node) {
      const overlayRect = overlay.node.getBoundingClientRect();
      cursorX = overlayRect.left + overlayRect.width / 2;
      cursorY = overlayRect.top + overlayRect.height / 2;
    } else {
      cursorX = rect.left + rect.width / 2 + (transform?.x ?? 0);
      cursorY = rect.top + rect.height / 2 + (transform?.y ?? 0);
    }
    setLastDragCenterY(cursorY);
    const colRects = new Map<string, { left: number; right: number }>();
    const cardRectsByCol = new Map<string, { top: number; height: number }[]>();
    for (const [col, el] of columnRefs) {
      const r = el.getBoundingClientRect();
      colRects.set(col, { left: r.left, right: r.right });
      const cards = el.querySelectorAll<HTMLElement>("[data-drag-source]");
      const rects: { top: number; height: number }[] = [];
      for (const card of cards) {
        const cr = card.getBoundingClientRect();
        rects.push({ top: cr.top, height: cr.height });
      }
      cardRectsByCol.set(col, rects);
    }

    let dragSource: { column: string; index: number } | undefined;
    const dragId = activeId();
    if (dragId) {
      const { column: fromColumn, folderName } = parseId(dragId);
      const colTickets = ticketsForColumn(fromColumn);
      const idx = colTickets.findIndex(t => t.folderName === folderName);
      if (idx !== -1) dragSource = { column: fromColumn, index: idx };
    }

    setHoverTarget(computeHoverTarget(colRects, cardRectsByCol, { x: cursorX, y: cursorY }, dragSource));
  }

  function handleDragEnd(event: DndDragEvent) {
    const draggableId = activeId();
    setActiveId(null);
    setHoverTarget(null);

    if (!draggableId || !event.droppable) return;

    const { column: fromColumn, folderName } = parseId(draggableId);
    const droppableIdStr = String(event.droppable.id);

    let toColumn: string;
    let newIndex: number;

    if (droppableIdStr.startsWith(COLUMN_PREFIX)) {
      // Dropped on empty column placeholder
      toColumn = droppableIdStr.slice(COLUMN_PREFIX.length);
      newIndex = ticketsForColumn(toColumn).length;
    } else {
      // Dropped on a sortable item
      const target = parseId(droppableIdStr);
      toColumn = target.column;
      const colTickets = ticketsForColumn(toColumn);
      newIndex = colTickets.findIndex(t => t.folderName === target.folderName);

      if (fromColumn === toColumn) {
        const fromIdx = colTickets.findIndex(t => t.folderName === folderName);
        if (fromIdx === newIndex) return;
      } else if (event.droppable?.node) {
        // For cross-column drops, check if the dragged item was below the
        // target's center -- if so, insert after the target, not before.
        const droppableRect = event.droppable.node.getBoundingClientRect();
        const droppableCenterY = droppableRect.top + droppableRect.height / 2;
        if (lastDragCenterY() > droppableCenterY) {
          newIndex += 1;
        }
      }
    }

    props.onReorder(folderName, fromColumn, toColumn, newIndex);
  }

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      collisionDetector={closestCenter}
    >
      <DragDropSensors />
      <div
        class="flex gap-4 overflow-x-auto p-4"
        style={{ "min-height": "calc(100vh - 80px)" }}
      >
        <For each={props.board.columns}>
          {(column) => {
            const colTickets = () => ticketsForColumn(column);
            const colIds = () => idsForColumn(column);
            const tailIndicator = () => {
              const h = hoverTarget();
              return h !== null && h.column === column && h.index === colTickets().length;
            };
            return (
              <div class="flex min-w-[250px] flex-1 flex-col rounded-lg bg-muted/50 p-3">
                <h3 class="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                  {column}
                </h3>
                <SortableProvider ids={colIds()}>
                  <div
                    ref={(el) => columnRefs.set(column, el)}
                    class="flex flex-1 flex-col gap-2"
                  >
                    <For each={colTickets()}>
                      {(ticket, i) => (
                        <SortableTicketCard
                          ticket={ticket}
                          column={column}
                          index={i()}
                          activeId={activeId()}
                          hoverTarget={hoverTarget()}
                          onEdit={props.onEdit}
                          onDelete={props.onDelete}
                          onViewDetail={props.onViewDetail}
                        />
                      )}
                    </For>
                    <Show when={colTickets().length === 0}>
                      <EmptyColumnPlaceholder column={column} />
                    </Show>
                    <ColumnDropIndicator show={tailIndicator()} />
                  </div>
                </SortableProvider>
              </div>
            );
          }}
        </For>
      </div>
      <DragOverlay>
        {() => {
          const ticket = activeTicket();
          return (
            <Show when={ticket}>
              {(t) => (
                <div
                  class="rotate-2 scale-95 opacity-80 shadow-xl"
                  style={{ width: "250px" }}
                >
                  <TicketCard
                    ticket={t()}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onViewDetail={() => {}}
                  />
                </div>
              )}
            </Show>
          );
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}
