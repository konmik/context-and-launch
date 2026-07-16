import { Position, type Edge, type Node } from "@dschz/solid-flow";
import {
  autoLayoutPositions,
  buildLookup,
  CARD_HEIGHT,
  CARD_WIDTH,
  effectiveParent,
  projectDependencies,
  representativeInScope,
  resolveScope,
  type DependencyRelation,
  type ExternalDependencyProjection,
  type ForestTicket,
} from "./forest-graph.js";
import type { ForestLayout } from "~/core/ticket/forest-layout-store.js";

export interface ForestNodeData {
  [key: string]: unknown;
  ticket: ForestTicket;
  representedTicketNumbers: string[];
  group: boolean;
}

export interface ForestEdgeData {
  [key: string]: unknown;
  relations: DependencyRelation[];
}

export type ForestFlowNode = Node<ForestNodeData, "forest-ticket">;
export type ForestFlowEdge = Edge<ForestEdgeData, "forest-dependency">;

export interface ForestFlowModel {
  nodes: ForestFlowNode[];
  edges: ForestFlowEdge[];
  externalDependencies: ExternalDependencyProjection[];
}

export function buildForestFlowModel(
  tickets: ForestTicket[],
  scopeGroupNumber: string | undefined,
  savedLayout: ForestLayout,
): ForestFlowModel {
  const lookup = buildLookup(tickets);
  const scopeNodes = resolveScope(tickets, scopeGroupNumber, lookup);
  const { internal, external } = projectDependencies(tickets, scopeGroupNumber, lookup);
  const representedByScopeNode = new Map<string, string[]>();
  const parentNumbers = new Set<string>();
  for (const ticket of tickets) {
    const representative = representativeInScope(lookup, ticket.number, scopeGroupNumber);
    if (representative) {
      const represented = representedByScopeNode.get(representative);
      if (represented) represented.push(ticket.number);
      else representedByScopeNode.set(representative, [ticket.number]);
    }
    const parent = effectiveParent(ticket, lookup.allNumbers);
    if (parent) parentNumbers.add(parent);
  }
  const savedScopePositions: ForestLayout = {};
  for (const ticket of scopeNodes) {
    const position = savedLayout[ticket.number];
    if (position) savedScopePositions[ticket.number] = position;
  }
  const positions = {
    ...autoLayoutPositions(scopeNodes, internal),
    ...savedScopePositions,
  };

  return {
    nodes: scopeNodes.map(ticket => ({
      id: ticket.number,
      type: "forest-ticket",
      position: positions[ticket.number] ?? { x: 0, y: 0 },
      data: {
        ticket,
        representedTicketNumbers: representedByScopeNode.get(ticket.number) ?? [],
        group: parentNumbers.has(ticket.number),
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: { width: `${CARD_WIDTH}px` },
    })),
    edges: internal.map(dependency => ({
      id: `dependency:${dependency.fromNumber}:${dependency.toNumber}`,
      type: "forest-dependency",
      source: dependency.fromNumber,
      target: dependency.toNumber,
      sourceHandle: "bottom",
      targetHandle: "top",
      selectable: false,
      data: { relations: dependency.relations },
    })),
    externalDependencies: external,
  };
}

export function rearrangedForestPositions(
  tickets: ForestTicket[],
  scopeGroupNumber: string | undefined,
): ForestLayout {
  const lookup = buildLookup(tickets);
  return autoLayoutPositions(
    resolveScope(tickets, scopeGroupNumber, lookup),
    projectDependencies(tickets, scopeGroupNumber, lookup).internal,
  );
}

export function positionsFromNodes(nodes: ForestFlowNode[]): ForestLayout {
  return Object.fromEntries(nodes.map(node => [node.id, { ...node.position }]));
}

export function groupPosition(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  return {
    x: bounds.x + (bounds.width - CARD_WIDTH) / 2,
    y: bounds.y + (bounds.height - CARD_HEIGHT) / 2,
  };
}
