import { For, Show, createSignal, createMemo, createEffect, on } from "solid-js";
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
  onArchive: (ticket: TicketInfo) => void;
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

function DropPreview(props: { ticket: TicketInfo }) {
  return (
    <div data-drop-indicator data-drop-preview class="pointer-events-none opacity-40">
      <TicketCard
        ticket={props.ticket}
        onEdit={() => {}}
        onDelete={() => {}}
        onArchive={() => {}}
        onViewDetail={() => {}}
      />
    </div>
  );
}

function SortableTicketCard(props: {
  ticket: TicketInfo;
  column: string;
  index: number;
  activeId: string | null;
  activeTicket: TicketInfo | null;
  hoverTarget: HoverTarget | null;
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
      classList={{ "opacity-30": isActive() }}
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
  return <div ref={droppable.ref} class="flex-1" />;
}

export default function KanbanBoard(props: KanbanBoardProps) {
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [lastDragCenterY, setLastDragCenterY] = createSignal(0);
  const [hoverTarget, setHoverTarget] = createSignal<HoverTarget | null>(null);
  const [orderOverride, setOrderOverride] = createSignal<Record<string, string[]> | null>(null);

  const columnRefs = new Map<string, HTMLDivElement>();

  function commitDrop(fromColumn: string, folderName: string, toColumn: string, newIndex: number) {
    const updated = { ...ticketOrder() };
    updated[fromColumn] = (updated[fromColumn] ?? []).filter(fn => fn !== folderName);
    updated[toColumn] = [...(updated[toColumn] ?? [])];
    updated[toColumn].splice(newIndex, 0, folderName);
    setOrderOverride(updated);
    setActiveId(null);
    setHoverTarget(null);
    props.onReorder(folderName, fromColumn, toColumn, newIndex);
  }

  if (typeof window !== "undefined") {
    (window as any).__kanbanTestHooks = { setHoverTarget, setActiveId, setOrderOverride, setLastDragCenterY, commitDrop };
  }

  createEffect(on(
    () => props.board.ticketOrder,
    () => setOrderOverride(null)
  ));

  const ticketMap = createMemo(() => {
    const map = new Map<string, TicketInfo>();
    for (const t of props.board.tickets) {
      map.set(t.folderName, t);
    }
    return map;
  });

  function ticketOrder(): Record<string, string[]> {
    return orderOverride() ?? props.board.ticketOrder;
  }

  function ticketsForColumn(column: string): TicketInfo[] {
    const order = ticketOrder()[column] ?? [];
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
      const cards = el.querySelectorAll<HTMLElement>("[data-drag-source]:not([data-drop-preview] *)");
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

  function handleDragEnd(_event: DndDragEvent) {
    const draggableId = activeId();
    const ht = hoverTarget();

    if (!draggableId || !ht) {
      setActiveId(null);
      setHoverTarget(null);
      return;
    }

    const { column: fromColumn, folderName } = parseId(draggableId);
    const toColumn = ht.column;
    const newIndex = ht.index;

    if (fromColumn === toColumn) {
      const colTickets = ticketsForColumn(toColumn);
      const fromIdx = colTickets.findIndex(t => t.folderName === folderName);
      if (fromIdx === newIndex) {
        setActiveId(null);
        setHoverTarget(null);
        return;
      }
    }

    commitDrop(fromColumn, folderName, toColumn, newIndex);
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
            const tailPreview = () => {
              const h = hoverTarget();
              const aid = activeId();
              if (!h || !aid || h.column !== column || h.index !== colTickets().length) return false;
              return parseId(aid).column !== column;
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
                          activeTicket={activeTicket()}
                          hoverTarget={hoverTarget()}
                          onEdit={props.onEdit}
                          onDelete={props.onDelete}
                          onArchive={props.onArchive}
                          onViewDetail={props.onViewDetail}
                        />
                      )}
                    </For>
                    <Show when={tailPreview() && activeTicket()}>
                      {(t) => <DropPreview ticket={t()} />}
                    </Show>
                    <Show when={colTickets().length === 0}>
                      <EmptyColumnDropzone column={column} />
                    </Show>
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
                    onArchive={() => {}}
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
