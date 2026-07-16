import {
  NodeToolbar,
  Panel,
  SolidFlow,
  useNodes,
  useSolidFlow,
  useViewport,
  type EdgeProps,
  type EdgeTypes,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from "@dschz/solid-flow";
import "@dschz/solid-flow/styles";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Accessor,
} from "solid-js";
import { Portal } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import type { OverlayRect } from "../shared/ExpandingOverlay";
import ForestCard, {
  ForestCardCommandsContext,
  ForestConnectionSessionContext,
  type ForestCardCommands,
} from "./ForestCard.js";
import ForestDependencyEdge from "./ForestDependencyEdge.js";
import {
  dependencyFromEndpoints,
  isConnectionTarget,
  type ConnectionAnchor,
  type ConnectionEndpoint,
  type ConnectionSurface,
  type ForestConnectionCommands,
  type ForestConnectionSession,
} from "./forest-connections.js";
import {
  buildForestFlowModel,
  groupPosition,
  positionsFromNodes,
  rearrangedForestPositions,
  type ForestEdgeData,
  type ForestFlowEdge,
  type ForestFlowModel,
  type ForestFlowNode,
  type ForestNodeData,
} from "./forest-flow-model.js";
import {
  buildLookup,
  representativeInScope,
  type DependencyRelation,
  type ForestTicket,
} from "./forest-graph.js";
import {
  externalDependencyPath,
  nodeEndpointPoint,
  viewportAnchor,
  viewportForBounds,
  viewportForLayout,
  viewportFromAnchor,
  type ViewportAnchor,
} from "./forest-viewport.js";
import { useEscapeKey } from "~/lib/use-escape-key.js";
import type { ForestLayout } from "~/core/ticket/forest-layout-store.js";

function ForestCardAdapter(props: NodeProps<Record<string, unknown>, string | undefined>) {
  return <ForestCard {...props as NodeProps<ForestNodeData, "forest-ticket">} />;
}

function ForestDependencyEdgeAdapter(
  props: EdgeProps<Record<string, unknown>, string | undefined>,
) {
  return <ForestDependencyEdge {...props as EdgeProps<ForestEdgeData, "forest-dependency">} />;
}

const nodeTypes = { "forest-ticket": ForestCardAdapter } satisfies NodeTypes;
const edgeTypes = { "forest-dependency": ForestDependencyEdgeAdapter } satisfies EdgeTypes;

export interface ForestSurfaceData {
  tickets: ForestTicket[];
  layout: ForestLayout;
  scopeGroupNumber?: string;
  viewportAnchor?: ViewportAnchor;
}

export interface ForestSurfaceApi {
  connectionAnchor: (endpoint: ConnectionEndpoint) => ConnectionAnchor | undefined;
}

export interface ForestSurfaceCommands {
  addDependency: (dependentNumber: string, dependencyNumber: string) => Promise<boolean>;
  groupSelection: (
    memberNumbers: string[],
    position: { x: number; y: number },
  ) => void;
  openGroup: (ticketNumber: string, cardRect: OverlayRect) => void;
  openTicket: (ticketNumber: string) => void;
  persistPositions: (positions: ForestLayout) => Promise<void>;
  persistViewport?: (anchor: ViewportAnchor) => void;
  registerSurface: (api: ForestSurfaceApi | undefined) => void;
  removeDependencies: (relations: DependencyRelation[]) => Promise<void>;
  reportError: (error: unknown) => void;
  ungroup: (ticketNumber: string) => void;
}

interface ForestSurfaceProps {
  data: ForestSurfaceData;
  commands: ForestSurfaceCommands;
  connectionSession: Accessor<ForestConnectionSession>;
  connectionCommands: ForestConnectionCommands;
}

interface DependencyPopup {
  relations: DependencyRelation[];
  screenX: number;
  screenY: number;
}

function surfaceInfo(
  element: HTMLDivElement,
  scopeGroupNumber: string | undefined,
): ConnectionSurface {
  const boundary = element.closest<HTMLElement>("[data-forest-connection-boundary]") ?? element;
  const bounds = boundary.getBoundingClientRect();
  return {
    scopeGroupNumber,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  };
}

function FlowCanvas(props: {
  data: ForestSurfaceData;
  model: ForestFlowModel;
  commands: ForestSurfaceCommands;
  connectionSession: Accessor<ForestConnectionSession>;
  connectionCommands: ForestConnectionCommands;
  size: { width: number; height: number };
  initialViewport: Viewport;
  getSurface: () => HTMLDivElement;
  setViewport: (viewport: Viewport) => void;
}) {
  const [nodes, setNodes] = createStore<ForestFlowNode[]>(props.model.nodes);
  const [edges, setEdges] = createStore<ForestFlowEdge[]>(props.model.edges);
  createEffect(() => setNodes(reconcile(props.model.nodes, { key: "id" })));
  createEffect(() => setEdges(reconcile(props.model.edges, { key: "id" })));
  const [selectedNodeIds, setSelectedNodeIds] = createSignal<string[]>([]);
  const [pendingPositionWrites, setPendingPositionWrites] = createSignal(0);
  const isPersistingPositions = () => pendingPositionWrites() > 0;
  const [dependencyPopup, setDependencyPopup] = createSignal<DependencyPopup>();
  const ticketLookup = createMemo(() => buildLookup(props.data.tickets));
  const dependsOnByNumber = createMemo(
    () => new Map(props.data.tickets.map(ticket => [ticket.number, ticket.dependsOn ?? []])),
  );
  let surfaceApi: ForestSurfaceApi | undefined;
  let nativeConnectionCompleted = false;

  async function persistPositions(positions: ForestLayout) {
    setPendingPositionWrites(count => count + 1);
    try {
      await props.commands.persistPositions(positions);
    } catch (error) {
      props.commands.reportError(error);
    } finally {
      setPendingPositionWrites(count => count - 1);
    }
  }

  async function completeConnection(
    source: ConnectionEndpoint,
    target: ConnectionEndpoint,
    pendingEdgeId?: string,
  ) {
    if (!isConnectionTarget(source, target)) return;
    const { dependentNumber, dependencyNumber } = dependencyFromEndpoints(source, target);
    let connected: boolean;
    try {
      connected = await props.commands.addDependency(dependentNumber, dependencyNumber);
    } catch (error) {
      if (pendingEdgeId) setEdges(current => current.filter(edge => edge.id !== pendingEdgeId));
      props.connectionCommands.cancel();
      props.commands.reportError(error);
      return;
    }
    if (!connected && pendingEdgeId) {
      setEdges(current => current.filter(edge => edge.id !== pendingEdgeId));
    }
  }

  function submitConnection(
    source: ConnectionEndpoint,
    target: ConnectionEndpoint,
    pendingEdgeId?: string,
  ) {
    props.connectionCommands.cancel();
    void completeConnection(source, target, pendingEdgeId);
  }

  function beginConnection(endpoint: ConnectionEndpoint) {
    const anchor = surfaceApi?.connectionAnchor(endpoint);
    if (!anchor) throw new Error(`Forest connection handle ${endpoint.ticketNumber} is unavailable`);
    props.connectionCommands.begin(endpoint, anchor);
  }

  function activateConnection(endpoint: ConnectionEndpoint) {
    const session = props.connectionSession();
    if (session.kind === "connecting" && isConnectionTarget(session.source, endpoint)) {
      submitConnection(session.source, endpoint);
      return;
    }
    beginConnection(endpoint);
  }

  function beginNativeConnection(ticketNumber: string, handleType: "source" | "target") {
    beginConnection({
      ticketNumber,
      end: handleType === "source" ? "bottom" : "top",
    });
  }

  function showDependencyPopup(relations: DependencyRelation[], event: MouseEvent) {
    event.stopPropagation();
    setDependencyPopup({
      relations,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  }

  async function deleteDependency() {
    const popup = dependencyPopup();
    if (!popup) return;
    try {
      await props.commands.removeDependencies(popup.relations);
      setDependencyPopup(undefined);
    } catch (error) {
      props.commands.reportError(error);
    }
  }

  const cardCommands: ForestCardCommands = {
    activateConnection,
    openGroupTicket: props.commands.openTicket,
    ungroup: props.commands.ungroup,
  };

  useEscapeKey(() => setDependencyPopup(undefined));

  function FlowRuntime() {
    const flow = useSolidFlow<ForestFlowNode, ForestFlowEdge>();
    const flowNodes = useNodes<ForestFlowNode>();
    const viewport = useViewport();
    let previousSize = props.size;

    function connectionAnchor(endpoint: ConnectionEndpoint): ConnectionAnchor | undefined {
      const representative = representativeInScope(
        ticketLookup(),
        endpoint.ticketNumber,
        props.data.scopeGroupNumber,
      );
      if (!representative) return undefined;
      const node = flow.getInternalNode(representative);
      if (!node) return undefined;
      return {
        screenPoint: flow.flowToScreenPosition(nodeEndpointPoint(node, endpoint.end)),
        surface: surfaceInfo(props.getSurface(), props.data.scopeGroupNumber),
      };
    }

    function refreshConnectionAnchor() {
      const session = props.connectionSession();
      if (session.kind !== "connecting") return;
      const anchor = connectionAnchor(session.source);
      if (anchor) props.connectionCommands.reanchorSource(anchor);
    }

    function cardBounds(ticketNumbers: string[]) {
      if (ticketNumbers.length === 0) return undefined;
      const bounds = flow.getNodesBounds(ticketNumbers);
      return bounds.width > 0 && bounds.height > 0 ? bounds : undefined;
    }

    async function rearrange() {
      if (isPersistingPositions()) return;
      const positions = rearrangedForestPositions(
        props.data.tickets,
        props.data.scopeGroupNumber,
      );
      for (const [ticketNumber, position] of Object.entries(positions)) {
        flow.updateNode(ticketNumber, { position });
      }
      await persistPositions(positions);
    }

    async function center() {
      const bounds = cardBounds(props.model.nodes.map(node => node.id));
      const nextViewport = bounds
        ? viewportForBounds(bounds, props.size.width, props.size.height)
        : { x: props.size.width / 2, y: props.size.height / 2, zoom: 1 };
      await flow.setViewport(nextViewport);
      props.setViewport(nextViewport);
      props.commands.persistViewport?.(
        viewportAnchor(nextViewport, props.size.width, props.size.height),
      );
      refreshConnectionAnchor();
    }

    function groupSelectedNodes() {
      const selectedIds = selectedNodeIds();
      if (selectedIds.length < 2) return;
      const bounds = cardBounds(selectedIds);
      if (!bounds) throw new Error("Selected Forest cards are unavailable");
      props.commands.groupSelection(selectedIds, groupPosition(bounds));
    }

    const externalPaths = createMemo(() => {
      if (props.model.externalDependencies.length === 0) return [];
      viewport();
      flowNodes();
      const surfaceBounds = props.getSurface().getBoundingClientRect();
      const boundaryBounds = surfaceInfo(props.getSurface(), props.data.scopeGroupNumber).bounds;
      return props.model.externalDependencies.flatMap(dependency => {
        const node = flow.getInternalNode(dependency.memberNumber);
        if (!node) return [];
        const clientPoint = flow.flowToScreenPosition(
          nodeEndpointPoint(node, dependency.direction === "down" ? "bottom" : "top"),
        );
        const start = {
          x: clientPoint.x - surfaceBounds.left,
          y: clientPoint.y - surfaceBounds.top,
        };
        const targetY = dependency.direction === "down"
          ? boundaryBounds.y + boundaryBounds.height - surfaceBounds.top
          : boundaryBounds.y - surfaceBounds.top;
        return [{
          ...dependency,
          d: externalDependencyPath(start, dependency.direction, targetY),
        }];
      });
    });

    const connecting = createMemo(() => props.connectionSession().kind === "connecting");
    createEffect(() => {
      if (!connecting()) return;
      viewport();
      flowNodes();
      queueMicrotask(refreshConnectionAnchor);
    });

    createEffect(() => {
      setSelectedNodeIds(flowNodes().filter(node => node.selected).map(node => node.id));
    });

    createEffect(() => {
      const nextSize = props.size;
      if (nextSize.width === previousSize.width && nextSize.height === previousSize.height) return;
      const anchor = viewportAnchor(flow.getViewport(), previousSize.width, previousSize.height);
      const nextViewport = viewportFromAnchor(anchor, nextSize.width, nextSize.height);
      previousSize = nextSize;
      void flow.setViewport(nextViewport);
      props.setViewport(nextViewport);
    });

    onMount(() => {
      props.setViewport(flow.getViewport());
      surfaceApi = { connectionAnchor };
      props.commands.registerSurface(surfaceApi);
      queueMicrotask(refreshConnectionAnchor);
    });
    onCleanup(() => {
      surfaceApi = undefined;
      props.commands.registerSurface(undefined);
    });

    return (
      <>
        <Panel position="top-left" class="flex gap-4 nopan nodrag" style={{ margin: "12px" }}>
          <button
            class="btn-secondary"
            on:pointerdown={(event: PointerEvent) => event.stopPropagation()}
            onClick={() => void rearrange()}
            disabled={isPersistingPositions()}
            data-testid="forest-rearrange-button"
          >Rearrange</button>
          <button
            class="btn-secondary"
            on:pointerdown={(event: PointerEvent) => event.stopPropagation()}
            onClick={() => void center()}
            data-testid="forest-center-button"
          >Center</button>
        </Panel>

        <Show when={selectedNodeIds().length >= 2}>
          <NodeToolbar
            nodeId={selectedNodeIds()}
            position="top"
            align="center"
            offset={12}
            isVisible
          >
            <button
              class="btn-primary nodrag nopan"
              on:pointerdown={(event: PointerEvent) => event.stopPropagation()}
              onClick={groupSelectedNodes}
              data-testid="forest-group-button"
            >Group</button>
          </NodeToolbar>
        </Show>

        <Show when={externalPaths().length > 0}>
          <Portal mount={props.getSurface()}>
            <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <For each={externalPaths()}>
              {(dependency) => (
                <>
                  <path
                    d={dependency.d}
                    fill="none"
                    class="stroke-muted-foreground"
                    stroke-width="1"
                    stroke-dasharray="6 4"
                    pointer-events="none"
                    data-testid="forest-external-dependency"
                    data-from={dependency.relations[0]?.fromNumber}
                    data-to={dependency.relations[0]?.toNumber}
                  />
                  <path
                    d={dependency.d}
                    fill="none"
                    stroke="transparent"
                    stroke-width="32"
                    style={{ "pointer-events": "stroke", cursor: "pointer" }}
                    on:pointerdown={(event: PointerEvent) => event.stopPropagation()}
                    onClick={(event: MouseEvent) => showDependencyPopup(dependency.relations, event)}
                  />
                </>
              )}
              </For>
            </svg>
          </Portal>
        </Show>
      </>
    );
  }

  return (
    <ForestConnectionSessionContext.Provider value={props.connectionSession}>
      <ForestCardCommandsContext.Provider value={cardCommands}>
        <SolidFlow<ForestFlowNode, ForestFlowEdge>
          id={`forest-${props.data.scopeGroupNumber ?? "root"}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          initialViewport={props.initialViewport}
          minZoom={0.2}
          maxZoom={2.5}
          nodeDragThreshold={5}
          nodeClickDistance={5}
          connectionDragThreshold={5}
          connectionRadius={100}
          connectionMode="strict"
          connectionLineComponent={() => null}
          selectionKey="Shift"
          selectionMode="partial"
          panOnDrag
          nodesConnectable
          clickConnect={false}
          deleteKey={null}
          proOptions={{ hideAttribution: true }}
          class="h-full w-full"
          onPaneClick={() => {
            props.connectionCommands.cancel();
            setDependencyPopup(undefined);
          }}
          onMove={(_event, viewport) => props.setViewport(viewport)}
          onMoveEnd={(_event, viewport) => {
            props.setViewport(viewport);
            props.commands.persistViewport?.(
              viewportAnchor(viewport, props.size.width, props.size.height),
            );
          }}
          onNodeClick={({ node, event }) => {
            if (node.data.group) {
              const card = event.currentTarget instanceof Element
                ? event.currentTarget.querySelector<HTMLElement>("[data-forest-card]")
                : undefined;
              const bounds = card?.getBoundingClientRect();
              if (!bounds) throw new Error(`Forest card ${node.id} is unavailable`);
              props.commands.openGroup(node.id, {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              });
              return;
            }
            const session = props.connectionSession();
            if (session.kind === "connecting") {
              const target = {
                ticketNumber: node.id,
                end: session.source.end === "bottom" ? "top" as const : "bottom" as const,
              };
              if (isConnectionTarget(session.source, target)) {
                submitConnection(session.source, target);
              } else {
                props.connectionCommands.cancel();
              }
              return;
            }
            props.commands.openTicket(node.id);
          }}
          onNodeDragStop={({ nodes: movedNodes }) => {
            const positions = positionsFromNodes(movedNodes);
            void persistPositions(positions);
          }}
          isValidConnection={connection =>
            connection.source !== connection.target
            && !(dependsOnByNumber().get(connection.source) ?? []).includes(connection.target)
          }
          onBeforeConnect={connection => ({
            ...connection,
            type: "forest-dependency",
            data: {
              relations: [{ fromNumber: connection.source, toNumber: connection.target }],
            },
          })}
          onConnect={connection => {
            nativeConnectionCompleted = true;
            submitConnection(
              { ticketNumber: connection.source, end: "bottom" },
              { ticketNumber: connection.target, end: "top" },
              connection.id,
            );
          }}
          onConnectStart={(_event, connection) => {
            if (!connection.nodeId) throw new Error("Forest connection source is unavailable");
            beginNativeConnection(
              connection.nodeId,
              connection.handleType as "source" | "target",
            );
          }}
          onConnectEnd={() => {
            if (!nativeConnectionCompleted) props.connectionCommands.cancel();
            nativeConnectionCompleted = false;
          }}
          onEdgeClick={({ edge, event }) => {
            if (!edge.data) throw new Error(`Forest dependency ${edge.id} has no data`);
            showDependencyPopup(edge.data.relations, event);
          }}
        >
          <FlowRuntime />
        </SolidFlow>

        <Show when={dependencyPopup()}>
          {(popup) => (
            <Portal>
              <div class="fixed inset-0" onClick={() => setDependencyPopup(undefined)} />
              <div
                class="fixed rounded-md border border-border bg-popover p-1 shadow-md"
                style={{
                  left: `${popup().screenX}px`,
                  top: `${popup().screenY}px`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <button
                  class="btn-destructive px-3 py-1 text-sm"
                  onClick={() => void deleteDependency()}
                  data-testid="forest-dependency-delete"
                >Delete dependency</button>
              </div>
            </Portal>
          )}
        </Show>
      </ForestCardCommandsContext.Provider>
    </ForestConnectionSessionContext.Provider>
  );
}

export default function ForestSurface(props: ForestSurfaceProps) {
  const model = createMemo(() => buildForestFlowModel(
    props.data.tickets,
    props.data.scopeGroupNumber,
    props.data.layout,
  ));
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const measuredModel = createMemo(() => size().width > 0 && size().height > 0 ? model() : undefined);
  let surfaceRef: HTMLDivElement | undefined;
  let lastViewport: Viewport | undefined;

  function requireSurface(): HTMLDivElement {
    if (!surfaceRef) throw new Error("Forest surface is not mounted");
    return surfaceRef;
  }

  function initialViewport(flowModel: ForestFlowModel): Viewport {
    if (lastViewport) return lastViewport;
    const measuredSize = size();
    return props.data.viewportAnchor
      ? viewportFromAnchor(props.data.viewportAnchor, measuredSize.width, measuredSize.height)
      : viewportForLayout(
          positionsFromNodes(flowModel.nodes),
          measuredSize.width,
          measuredSize.height,
        );
  }

  onMount(() => {
    const element = requireSurface();
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={surfaceRef}
      class="relative h-full w-full overflow-hidden select-none touch-none"
      data-testid="forest-surface"
      data-connection-edit-mode={props.connectionSession().kind === "connecting" ? "active" : undefined}
      onPointerMove={(event: PointerEvent) => {
        if (props.connectionSession().kind === "connecting") {
          props.connectionCommands.movePointer(
            { x: event.clientX, y: event.clientY },
            surfaceInfo(requireSurface(), props.data.scopeGroupNumber),
          );
        }
      }}
    >
      <Show when={measuredModel()}>
        {(flowModel) => (
          <FlowCanvas
            data={props.data}
            model={flowModel()}
            commands={props.commands}
            connectionSession={props.connectionSession}
            connectionCommands={props.connectionCommands}
            size={size()}
            initialViewport={initialViewport(flowModel())}
            getSurface={requireSurface}
            setViewport={viewport => { lastViewport = viewport; }}
          />
        )}
      </Show>
    </div>
  );
}
