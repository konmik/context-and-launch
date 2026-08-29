/* eslint-disable max-len */
import { Portal } from "@solidjs/web";
import { Show, createContext, createSignal, onSettled, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { DragEvent, DragId, DragItem } from "./drag-types.js";

interface DragContextValue {
  active: () => DragItem | undefined;
  position: () => { x: number; y: number } | undefined;
  register(id: DragId, node: HTMLElement): void;
  activators(id: DragId): Record<string, (event: PointerEvent | KeyboardEvent) => void>;
}

const DragContext = createContext<DragContextValue>();

export function DragDropProvider(props: {
  children: JSX.Element;
  onDragStart?: (event: DragEvent) => void;
  onDragMove?: (event: DragEvent) => void;
  onDragOver?: (event: DragEvent) => void;
  onDragEnd?: (event: DragEvent) => void;
}) {
  const nodes = new Map<DragId, HTMLElement>();
  const measuredRects = new Map<DragId, DOMRect>();
  const [active, setActive] = createSignal<DragItem>();
  const [position, setPosition] = createSignal<{ x: number; y: number }>();
  let activeItem: DragItem | undefined;
  let dropTarget: DragItem | undefined;
  let removePointerListeners: (() => void) | undefined;

  function closestDropTarget(x: number, y: number, except: DragId): DragItem | undefined {
    let winner: DragItem | undefined;
    let distance = Infinity;
    for (const [id, node] of nodes) {
      if (id === except || !node.isConnected) continue;
      const rect = measuredRects.get(id) ?? node.getBoundingClientRect();
      const next = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (next < distance) { distance = next; winner = { id, node }; }
    }
    return winner;
  }
  function currentDragEvent(intent: DragEvent["intent"]): DragEvent {
    return { draggable: activeItem!, droppable: dropTarget, intent };
  }
  function resetDrag() {
    activeItem = undefined;
    setActive(undefined);
    setPosition(undefined);
    dropTarget = undefined;
    measuredRects.clear();
  }
  function beginDrag(id: DragId, node: HTMLElement, x: number, y: number, intent: DragEvent["intent"]) {
    measuredRects.clear();
    for (const [nodeId, candidate] of nodes) {
      if (candidate.isConnected) measuredRects.set(nodeId, candidate.getBoundingClientRect());
    }
    const item = { id, node, transform: { x: 0, y: 0 } };
    activeItem = item;
    setActive(item);
    setPosition({ x, y });
    props.onDragStart?.({ draggable: item, intent });
  }
  function moveDrag(x: number, y: number, intent: DragEvent["intent"]) {
    const item = activeItem;
    if (!item) return;
    const rect = item.node!.getBoundingClientRect();
    item.transform = { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
    setPosition({ x, y });
    dropTarget = closestDropTarget(x, y, item.id);
    props.onDragMove?.(currentDragEvent(intent));
    props.onDragOver?.(currentDragEvent(intent));
  }
  function finishDrag(intent: DragEvent["intent"]) {
    if (!activeItem) return;
    const final = currentDragEvent(intent);
    props.onDragEnd?.(final);
    resetDrag();
  }
  const context: DragContextValue = {
    active,
    position,
    register: (id, node) => nodes.set(id, node),
    activators: (id) => ({
      onPointerDown: (raw) => {
        const e = raw as PointerEvent;
        removePointerListeners?.();
        const node = nodes.get(id) ?? (e.currentTarget as HTMLElement);
        const target = e.currentTarget as HTMLElement;
        const start = { x: e.clientX, y: e.clientY };
        const pointerMove = (next: PointerEvent) => {
          if (!activeItem && Math.hypot(next.clientX - start.x, next.clientY - start.y) >= 4) {
            beginDrag(id, node, start.x, start.y, "pointer");
            target.setPointerCapture?.(next.pointerId);
          }
          if (activeItem) moveDrag(next.clientX, next.clientY, "pointer");
        };
        const pointerUp = () => {
          removePointerListeners?.();
          if (activeItem) finishDrag("pointer");
        };
        const pointerCancel = () => {
          removePointerListeners?.();
          resetDrag();
        };
        removePointerListeners = () => {
          window.removeEventListener("pointermove", pointerMove);
          window.removeEventListener("pointerup", pointerUp);
          window.removeEventListener("pointercancel", pointerCancel);
          removePointerListeners = undefined;
        };
        window.addEventListener("pointermove", pointerMove);
        window.addEventListener("pointerup", pointerUp);
        window.addEventListener("pointercancel", pointerCancel);
      },
      onKeyDown: (raw) => {
        const e = raw as KeyboardEvent;
        const node = nodes.get(id) ?? (e.currentTarget as HTMLElement);
        if ((e.key === " " || e.key === "Enter") && !activeItem) {
          e.preventDefault();
          const rect = node.getBoundingClientRect();
          beginDrag(id, node, rect.left + rect.width / 2, rect.top + rect.height / 2, "keyboard");
        } else if (e.key === "Escape") {
          resetDrag();
        } else if (activeItem && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          const ordered = [...nodes.entries()].filter(([key, candidate]) => key !== activeItem?.id && candidate.isConnected);
          const current = ordered.findIndex(([key]) => key === dropTarget?.id);
          const direction = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
          const target = ordered[(current + direction + ordered.length) % ordered.length];
          if (target) { dropTarget = { id: target[0], node: target[1] }; props.onDragOver?.(currentDragEvent("keyboard")); }
        } else if (activeItem && (e.key === " " || e.key === "Enter")) {
          e.preventDefault(); finishDrag("keyboard");
        }
      },
    }),
  };
  onSettled(() => () => {
    removePointerListeners?.();
    nodes.clear();
    resetDrag();
  });
  return <DragContext value={context}>{props.children}</DragContext>;
}

export function createSortable(id: DragId) {
  const drag = useContext(DragContext);
  return { ref: (node: HTMLElement) => drag.register(id, node), dragActivators: drag.activators(id) };
}
export function createDroppable(id: DragId) {
  const drag = useContext(DragContext);
  return { ref: (node: HTMLElement) => drag.register(id, node) };
}
export function DragOverlay(props: { children: (active?: DragItem) => JSX.Element }) {
  const drag = useContext(DragContext);
  return <Show when={drag.active()}>{(item) => <Portal><div class="pointer-events-none fixed" style={{ left: `${drag.position()?.x ?? 0}px`, top: `${drag.position()?.y ?? 0}px` }}>{props.children(item())}</div></Portal>}</Show>;
}
