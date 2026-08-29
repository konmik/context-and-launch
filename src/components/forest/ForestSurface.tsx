/* eslint-disable max-len */
import { For, Show, createMemo, createSignal, createStore, onSettled, untrack, type Accessor } from "solid-js";
import { X } from "~/components/ui/icons.js";
import type { OverlayRect } from "../shared/ExpandingOverlay";
import ForestCard, { ForestCardCommandsContext, ForestCardColumnsContext, ForestConnectionSessionContext, type ForestCardCommands } from "./ForestCard.js";
import ForestDependencyEdge from "./ForestDependencyEdge.js";
import type { SwatchColumn } from "~/core/board/status-swatch.js";
import { dependencyFromEndpoints, isConnectionTarget, type ConnectionAnchor, type ConnectionEndpoint, type ConnectionSurface, type ForestConnectionCommands, type ForestConnectionSession } from "./forest-connections.js";
import { buildForestFlowModel, groupPosition, positionsFromNodes, rearrangedForestPositions, type ForestFlowNode } from "./forest-flow-model.js";
import { CARD_HEIGHT, CARD_WIDTH, representativeInScope, type DependencyRelation, type ForestTicket } from "./forest-graph.js";
import { externalDependencyPath, viewportForLayout } from "./forest-viewport.js";
import type { ForestViewport } from "./forest-types.js";
import { useEscapeKey } from "~/lib/use-escape-key.js";
import type { ForestLayout } from "~/core/ticket/forest-layout-store.js";

export interface ForestSurfaceData {
  tickets: ForestTicket[];
  layout: ForestLayout;
  columns: SwatchColumn[];
  scopeGroupNumber?: string;
  viewport?: ForestViewport;
}
export interface ForestSurfaceApi {
  clearSelection: () => void;
  connectionAnchor: (endpoint: ConnectionEndpoint) => ConnectionAnchor | undefined;
}
export interface ForestSurfaceCommands {
  addDependency: (dependentNumber: string, dependencyNumber: string) => Promise<boolean>;
  groupSelection: (memberNumbers: string[], position: { x: number; y: number }) => void;
  openGroup: (ticketNumber: string, cardRect: OverlayRect) => void;
  onClose?: () => void;
  openTicket: (ticketNumber: string) => void;
  persistPositions: (positions: ForestLayout) => Promise<void>;
  persistViewport?: (viewport: ForestViewport) => void;
  registerSurface: (api: ForestSurfaceApi | undefined) => void;
  removeDependency: (relation: DependencyRelation) => Promise<void>;
  reportError: (cause: unknown) => void;
  ungroup: (ticketNumber: string) => void;
}
interface Props { data: ForestSurfaceData; commands: ForestSurfaceCommands; connectionSession: Accessor<ForestConnectionSession>; connectionCommands: ForestConnectionCommands }
interface Popup { relations: DependencyRelation[]; screenX: number; screenY: number }

function surfaceInfo(element: HTMLElement, scopeGroupNumber: string | undefined): ConnectionSurface {
  const boundary = element.closest<HTMLElement>("[data-forest-connection-boundary]") ?? element;
  const bounds = boundary.getBoundingClientRect();
  return { scopeGroupNumber, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
}

export default function ForestSurface(props: Props) {
  const model = createMemo(() => buildForestFlowModel(props.data.tickets, props.data.scopeGroupNumber, props.data.layout));
  const [nodes, setNodes] = createStore(
    () => model().nodes,
    [] as ForestFlowNode[],
    { key: "id" },
  );
  const [viewport, setViewport] = createSignal<ForestViewport>(
    untrack(() => props.data.viewport) ?? { x: 0, y: 0, zoom: 1 },
  );
  const [selected, setSelected] = createSignal<string[]>([]);
  const [popup, setPopup] = createSignal<Popup>();
  const [persisting, setPersisting] = createSignal(false);
  const [panning, setPanning] = createSignal(false);
  const [selectionRect, setSelectionRect] = createSignal<{ x: number; y: number; width: number; height: number }>();
  const [geometryRevision, setGeometryRevision] = createSignal(0);
  const [raisedNodeId, setRaisedNodeId] = createSignal<string>();
  let surface!: HTMLDivElement;
  let measured = false;
  let suppressedClick: { id: string; until: number } | undefined;

  const screenPoint = (point: { x: number; y: number }, current = viewport()) => ({ x: point.x * current.zoom + current.x, y: point.y * current.zoom + current.y });
  const nodeById = (id: string) => nodes.find((node) => node.id === id);
  function endpoint(id: string, end: "top" | "bottom") {
    geometryRevision();
    const node = nodeById(id);
    if (!node) return { x: 0, y: 0 };
    const card = surface?.querySelector<HTMLElement>(`[data-forest-card][data-ticket-number="${CSS.escape(id)}"]`);
    if (!card) return { x: node.position.x + CARD_WIDTH / 2, y: node.position.y + (end === "bottom" ? CARD_HEIGHT : 0) };
    return {
      x: node.position.x + card.offsetWidth / 2,
      y: node.position.y + (end === "bottom" ? card.offsetHeight : 0),
    };
  }
  function connectionAnchor(connection: ConnectionEndpoint, current = viewport()): ConnectionAnchor | undefined {
    const representative = representativeInScope(model().lookup, connection.ticketNumber, props.data.scopeGroupNumber);
    if (!representative || !nodeById(representative)) return undefined;
    const local = screenPoint(endpoint(representative, connection.end), current);
    const rect = surface.getBoundingClientRect();
    return { screenPoint: { x: rect.left + local.x, y: rect.top + local.y }, surface: surfaceInfo(surface, props.data.scopeGroupNumber) };
  }
  function refreshAnchor(current = viewport()) {
    const session = props.connectionSession();
    if (session.kind === "connecting") {
      const anchor = connectionAnchor(session.source, current);
      if (anchor) props.connectionCommands.reanchorSource(anchor);
    }
  }
  function beginConnection(endpoint: ConnectionEndpoint) {
    const anchor = connectionAnchor(endpoint);
    if (anchor) props.connectionCommands.begin(endpoint, anchor);
  }
  function activateConnection(target: ConnectionEndpoint) {
    const session = props.connectionSession();
    if (session.kind !== "connecting") {
      setRaisedNodeId(undefined);
      return beginConnection(target);
    }
    if (!isConnectionTarget(session.source, target)) return;
    const { dependentNumber, dependencyNumber } = dependencyFromEndpoints(session.source, target);
    props.connectionCommands.cancel();
    void props.commands.addDependency(dependentNumber, dependencyNumber).catch(props.commands.reportError);
  }
  function dragConnection(source: ConnectionEndpoint) {
    if (props.connectionSession().kind === "connecting") return;
    beginConnection(source);
    const cleanup = () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
    const finish = (event: PointerEvent) => {
      cleanup();
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const handle = element?.closest<HTMLElement>("[data-connection-handle-end][data-ticket-number]");
      const card = element?.closest<HTMLElement>("[data-forest-card][data-ticket-number]");
      const ticketNumber = handle?.dataset.ticketNumber ?? card?.dataset.ticketNumber;
      const end = handle?.dataset.connectionHandleEnd as "top" | "bottom" | undefined;
      if (ticketNumber && ticketNumber !== source.ticketNumber) {
        activateConnection({ ticketNumber, end: end ?? (source.end === "bottom" ? "top" : "bottom") });
      } else if (!ticketNumber) {
        props.connectionCommands.cancel();
      }
    };
    const cancel = () => { cleanup(); props.connectionCommands.cancel(); };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  }
  const cardCommands: ForestCardCommands = untrack(() => ({
    activateConnection,
    dragConnection,
    openGroupTicket: props.commands.openTicket,
    ungroup: props.commands.ungroup,
  }));

  async function persistPositions(positions: ForestLayout) {
    setPersisting(true);
    try { await props.commands.persistPositions(positions); } catch (error) { props.commands.reportError(error); } finally { setPersisting(false); }
  }
  function bounds(ids = nodes.map((node) => node.id)) {
    const chosen = nodes.filter((node) => ids.includes(node.id));
    if (!chosen.length) return undefined;
    const minX = Math.min(...chosen.map((node) => node.position.x));
    const minY = Math.min(...chosen.map((node) => node.position.y));
    const maxX = Math.max(...chosen.map((node) => node.position.x + CARD_WIDTH));
    const maxY = Math.max(...chosen.map((node) => node.position.y + CARD_HEIGHT));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  function center() {
    const next = viewportForLayout(positionsFromNodes(nodes), surface.clientWidth, surface.clientHeight);
    setViewport(next); props.commands.persistViewport?.(next); refreshAnchor(next);
  }
  function rearrange() {
    if (persisting()) return;
    const positions = rearrangedForestPositions(props.data.tickets, props.data.scopeGroupNumber);
    setNodes((draft) => { for (const node of draft) if (positions[node.id]) node.position = positions[node.id]; });
    void persistPositions(positions);
  }
  function startNodeDrag(event: PointerEvent, id: string) {
    event.stopPropagation();
    setRaisedNodeId(id);
    if (event.shiftKey) { setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); return; }
    const node = nodeById(id)!;
    const target = event.currentTarget as HTMLElement;
    const origin = { x: event.clientX, y: event.clientY, position: { ...node.position } };
    let dragging = false;
    const move = (next: PointerEvent) => {
      if (!dragging && Math.hypot(next.clientX - origin.x, next.clientY - origin.y) < 4) return;
      if (!dragging) { dragging = true; target.setPointerCapture(next.pointerId); }
      setNodes((draft) => {
      const current = draft.find((value) => value.id === id)!;
      current.position.x = origin.position.x + (next.clientX - origin.x) / viewport().zoom;
      current.position.y = origin.position.y + (next.clientY - origin.y) / viewport().zoom;
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
    const end = () => {
      cleanup();
      if (dragging) {
        suppressedClick = { id, until: performance.now() + 1000 };
        void persistPositions({ [id]: { ...nodeById(id)!.position } });
        refreshAnchor();
      }
    };
    const cancel = () => cleanup();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }
  function startPan(event: PointerEvent) {
    if (event.button !== 0) return;
    const origin = { x: event.clientX, y: event.clientY, viewport: viewport() };
    let moved = false;
    surface.setPointerCapture(event.pointerId);
    setPanning(!event.shiftKey);
    const move = event.shiftKey
      ? (next: PointerEvent) => { moved = true; setSelectionRect({ x: Math.min(origin.x, next.clientX), y: Math.min(origin.y, next.clientY), width: Math.abs(next.clientX - origin.x), height: Math.abs(next.clientY - origin.y) }); }
      : (next: PointerEvent) => { moved = true; setViewport({ ...origin.viewport, x: origin.viewport.x + next.clientX - origin.x, y: origin.viewport.y + next.clientY - origin.y }); };
    const cleanup = () => {
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", end);
      surface.removeEventListener("pointercancel", cancel);
    };
    const end = () => {
      cleanup();
      const rectangle = selectionRect();
      if (event.shiftKey && rectangle) {
        const ids = [...surface.querySelectorAll<HTMLElement>("[data-forest-card]")].filter((card) => {
          const box = card.getBoundingClientRect();
          return box.left < rectangle.x + rectangle.width && box.right > rectangle.x && box.top < rectangle.y + rectangle.height && box.bottom > rectangle.y;
        }).map((card) => card.dataset.ticketNumber!).filter(Boolean);
        setSelected(ids);
        setSelectionRect(undefined);
      } else {
        props.commands.persistViewport?.(viewport()); refreshAnchor();
      }
      if (!moved && props.connectionSession().kind === "connecting") props.connectionCommands.cancel();
      setPanning(false);
    };
    const cancel = () => {
      cleanup();
      setSelectionRect(undefined);
      setPanning(false);
    };
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", cancel);
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    const rect = surface.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const previous = viewport();
    const zoom = Math.max(0.2, Math.min(2.5, previous.zoom * Math.exp(-event.deltaY * 0.001)));
    const next = { zoom, x: point.x - ((point.x - previous.x) / previous.zoom) * zoom, y: point.y - ((point.y - previous.y) / previous.zoom) * zoom };
    setViewport(next);
    props.commands.persistViewport?.(next);
    refreshAnchor(next);
  }
  function clickNode(event: MouseEvent, node: ForestFlowNode) {
    event.stopPropagation();
    if (event.shiftKey) return;
    if (suppressedClick?.id === node.id && performance.now() < suppressedClick.until) {
      suppressedClick = undefined;
      return;
    }
    suppressedClick = undefined;
    if (node.data.group) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      props.commands.openGroup(node.id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    } else if (props.connectionSession().kind === "connecting") {
      const session = props.connectionSession();
      if (session.kind !== "connecting") return;
      const source = session.source;
      const target = { ticketNumber: node.id, end: source.end === "bottom" ? "top" as const : "bottom" as const };
      if (isConnectionTarget(source, target)) activateConnection(target);
      else props.connectionCommands.cancel();
    } else props.commands.openTicket(node.id);
  }
  function nodeZIndex(node: ForestFlowNode) {
    const session = props.connectionSession();
    if (session.kind === "connecting") {
      return node.data.representedTicketNumbers.includes(session.source.ticketNumber) ? 0 : 1;
    }
    return raisedNodeId() === node.id ? 1 : 0;
  }
  function showPopup(relations: DependencyRelation[], event: MouseEvent) {
    event.stopPropagation();
    setPopup({
      relations: relations.map((relation) => ({ ...relation })),
      screenX: event.clientX,
      screenY: event.clientY,
    });
  }
  useEscapeKey(() => setPopup(undefined));
  onSettled(() => {
    const resize = () => { setGeometryRevision((value) => value + 1); if (!measured) { measured = true; if (!props.data.viewport) center(); } refreshAnchor(); };
    const movePointer = (event: PointerEvent) => {
      if (props.connectionSession().kind === "connecting") {
        props.connectionCommands.movePointer(
          { x: event.clientX, y: event.clientY },
          surfaceInfo(surface, props.data.scopeGroupNumber),
        );
      }
    };
    const observer = new ResizeObserver(resize); observer.observe(surface); resize();
    surface.addEventListener("pointermove", movePointer);
    props.commands.registerSurface({ clearSelection: () => setSelected([]), connectionAnchor });
    return () => { observer.disconnect(); surface.removeEventListener("pointermove", movePointer); props.commands.registerSurface(undefined); };
  });

  const externalPaths = createMemo(() => model().externalDependencies.map((dependency) => {
    const start = endpoint(dependency.memberNumber, dependency.direction === "down" ? "bottom" : "top");
    const boundaryScreenY = dependency.direction === "down" ? surface?.clientHeight ?? 0 : 0;
    const targetY = (boundaryScreenY - viewport().y) / viewport().zoom;
    return { ...dependency, start, targetY, d: externalDependencyPath(start, dependency.direction, targetY) };
  }));

  function surfaceClick(event: MouseEvent) {
    if (event.target !== event.currentTarget && !(event.target instanceof SVGElement)) return;
    const dependency = externalPaths().find((candidate) => {
      const handle = surface.querySelector<HTMLElement>(
        `[data-ticket-number="${CSS.escape(candidate.memberNumber)}"]`
        + `[data-connection-handle-end="${candidate.direction === "up" ? "top" : "bottom"}"]`,
      );
      if (!handle) return false;
      const bounds = handle.getBoundingClientRect();
      return Math.abs(event.clientX - (bounds.left + bounds.width / 2)) <= 16;
    });
    if (dependency) return showPopup(dependency.relations, event);
    props.connectionCommands.cancel();
    setPopup(undefined);
  }

  return <div ref={surface} class={`solid-flow__wrapper relative h-full w-full overflow-hidden select-none touch-none ${panning() ? "cursor-grabbing" : "cursor-default"}`} data-testid="forest-surface" data-connection-edit-mode={props.connectionSession().kind === "connecting" ? "active" : undefined} onPointerDown={startPan} onWheel={wheel} onClick={surfaceClick}>
    <div class="solid-flow__pane pointer-events-none absolute inset-0" style={{ cursor: panning() ? "grabbing" : "default" }} />
    <div class={`absolute z-20 flex gap-2 ${props.data.scopeGroupNumber === undefined ? "right-3" : "left-3"} top-3`}>
      <button class="btn-secondary" onPointerDown={(e) => e.stopPropagation()} onClick={rearrange} disabled={persisting()} data-testid="forest-rearrange-button">Rearrange</button>
      <button class="btn-secondary" onPointerDown={(e) => e.stopPropagation()} onClick={center} data-testid="forest-center-button">Center</button>
      <Show when={props.commands.onClose}>{(close) => <button class="btn-icon" style={{ height: "2.5rem", width: "2.5rem" }} onPointerDown={(e) => e.stopPropagation()} onClick={() => close()()} title="Close forest view" data-testid="forest-close-button"><X size={16} /></button>}</Show>
    </div>
    <Show when={props.data.scopeGroupNumber === undefined}><span class="pointer-events-none absolute bottom-3 left-3 z-20 text-xs text-muted-foreground" data-testid="forest-select-hint">Shift+mouse to select</span></Show>
    <Show when={selected().length >= 2}><button class="btn-primary absolute left-1/2 top-3 z-30" onPointerDown={(e) => e.stopPropagation()} onClick={() => { const selectedBounds = bounds(selected()); if (selectedBounds) props.commands.groupSelection(selected(), groupPosition(selectedBounds)); }} data-testid="forest-group-button">Group</button></Show>
    <Show when={selectionRect()}>{(rect) => <div class="solid-flow__selection pointer-events-none fixed border border-primary bg-primary/10" style={{ left: `${rect().x}px`, top: `${rect().y}px`, width: `${rect().width}px`, height: `${rect().height}px` }} />}</Show>
    <ForestConnectionSessionContext value={props.connectionSession}><ForestCardColumnsContext value={() => props.data.columns}><ForestCardCommandsContext value={cardCommands}>
      <div class="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport().x}px, ${viewport().y}px) scale(${viewport().zoom})` }}>
        <svg class="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          <For each={model().edges}>{(edge) => <ForestDependencyEdge source={edge.source} target={edge.target} sourcePoint={endpoint(edge.source, "bottom")} targetPoint={endpoint(edge.target, "top")} relations={edge.data.relations} onClick={(event) => showPopup(edge.data.relations, event)} />}</For>
          <For each={externalPaths()}>{(dependency) => <>
            <path d={dependency.d} fill="none" class="stroke-muted-foreground" stroke-width="1" stroke-dasharray="6 4" style={{ "pointer-events": "stroke", cursor: "pointer" }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => showPopup(dependency.relations, event)} data-testid="forest-external-dependency" data-from={dependency.relations[0]?.fromNumber} data-to={dependency.relations[0]?.toNumber} />
            <path d={dependency.d} fill="none" stroke="transparent" stroke-width="32" style={{ "pointer-events": "stroke", cursor: "pointer" }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => showPopup(dependency.relations, event)} />
          </>}</For>
        </svg>
        <For each={nodes}>{(node) => <div class="absolute" style={{ left: `${node.position.x}px`, top: `${node.position.y}px`, "z-index": nodeZIndex(node) }} onPointerDown={(event) => startNodeDrag(event, node.id)} onClick={(event) => clickNode(event, node)}><ForestCard data={node.data} selected={selected().includes(node.id)} /></div>}</For>
      </div>
    </ForestCardCommandsContext></ForestCardColumnsContext></ForestConnectionSessionContext>
    <Show when={popup()} keyed>{(value) =>
      <><div class="fixed inset-0 z-40" onClick={() => setPopup(undefined)} /><div class="fixed z-50 rounded-md border border-border bg-popover p-1" onPointerDown={(event) => event.stopPropagation()} style={{ left: `${value.screenX}px`, top: `${value.screenY}px`, transform: "translate(-50%, -50%)" }}><button class="btn-destructive px-3 py-1 text-sm" onClick={(event) => {
        event.stopPropagation();
        void (async () => {
          for (const relation of value.relations) await props.commands.removeDependency(relation);
          setPopup(undefined);
        })().catch(props.commands.reportError);
      }} data-testid="forest-dependency-delete">Delete dependency</button></div></>
    }</Show>
  </div>;
}
