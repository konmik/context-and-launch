import type { TicketInfo } from '~/core/ticket/ticket-store.js';
import type { ForestLayout } from '~/core/ticket/forest-layout-store.js';

export type ForestTicket = Pick<TicketInfo, 'number' | 'title' | 'folderName' | 'dependsOn' | 'memberOf'>;

export const CARD_WIDTH = 208;
export const CARD_HEIGHT = 72;
export const ROW_GAP = 160;
export const H_GAP = 248;

export interface DependencyRelation {
  fromNumber: string;
  toNumber: string;
}

export interface InternalDependencyProjection {
  fromNumber: string;
  toNumber: string;
  relations: DependencyRelation[];
}

export interface ExternalDependencyProjection {
  memberNumber: string;
  direction: 'down' | 'up';
  relations: DependencyRelation[];
}

export interface ForestLookup {
  byNumber: Map<string, ForestTicket>;
  allNumbers: Set<string>;
}

export function buildLookup(tickets: ForestTicket[]): ForestLookup {
  return {
    byNumber: new Map(tickets.map(t => [t.number, t])),
    allNumbers: new Set(tickets.map(t => t.number)),
  };
}

export function effectiveParent(ticket: ForestTicket, allNumbers: Set<string>): string | undefined {
  if (ticket.memberOf && allNumbers.has(ticket.memberOf)) return ticket.memberOf;
  return undefined;
}

export function resolveScope(
  tickets: ForestTicket[],
  scopeGroupNumber: string | undefined,
  lookup: ForestLookup = buildLookup(tickets),
): ForestTicket[] {
  return tickets.filter(t => effectiveParent(t, lookup.allNumbers) === scopeGroupNumber);
}

export function isGroup(tickets: ForestTicket[], ticketNumber: string): boolean {
  const allNumbers = new Set(tickets.map(t => t.number));
  return tickets.some(t => effectiveParent(t, allNumbers) === ticketNumber);
}

export function representativeInScope(
  lookup: ForestLookup,
  ticketNumber: string,
  scopeGroupNumber: string | undefined,
): string | undefined {
  const visited = new Set<string>();
  let current = ticketNumber;
  while (true) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    const ticket = lookup.byNumber.get(current);
    if (!ticket) return undefined;
    const parent = effectiveParent(ticket, lookup.allNumbers);
    if (parent === scopeGroupNumber) return current;
    if (parent === undefined) return undefined;
    current = parent;
  }
}

function upsert<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (!value) {
    value = create();
    map.set(key, value);
  }
  return value;
}

export interface DependencyProjections {
  internal: InternalDependencyProjection[];
  external: ExternalDependencyProjection[];
}

export function projectDependencies(
  tickets: ForestTicket[],
  scopeGroupNumber: string | undefined,
  lookup: ForestLookup = buildLookup(tickets),
): DependencyProjections {
  const internal = new Map<string, InternalDependencyProjection>();
  const external = new Map<string, ExternalDependencyProjection>();
  for (const ticket of tickets) {
    if (!ticket.dependsOn) continue;
    const fromRep = representativeInScope(lookup, ticket.number, scopeGroupNumber);
    for (const dep of ticket.dependsOn) {
      const toRep = representativeInScope(lookup, dep, scopeGroupNumber);
      const relation = { fromNumber: ticket.number, toNumber: dep };
      if (fromRep && toRep && fromRep !== toRep) {
        upsert(internal, `${fromRep}->${toRep}`, () => ({
          fromNumber: fromRep, toNumber: toRep, relations: [],
        })).relations.push(relation);
      } else if (scopeGroupNumber !== undefined && fromRep && !toRep) {
        upsert(external, `down:${fromRep}`, () => ({
          memberNumber: fromRep, direction: 'down' as const, relations: [],
        })).relations.push(relation);
      } else if (scopeGroupNumber !== undefined && !fromRep && toRep) {
        upsert(external, `up:${toRep}`, () => ({
          memberNumber: toRep, direction: 'up' as const, relations: [],
        })).relations.push(relation);
      }
    }
  }
  return {
    internal: Array.from(internal.values()),
    external: Array.from(external.values()),
  };
}

export function internalDependencies(
  tickets: ForestTicket[],
  scopeGroupNumber: string | undefined,
): InternalDependencyProjection[] {
  return projectDependencies(tickets, scopeGroupNumber).internal;
}

export function externalDependencies(
  tickets: ForestTicket[],
  scopeGroupNumber: string | undefined,
): ExternalDependencyProjection[] {
  return projectDependencies(tickets, scopeGroupNumber).external;
}

function buildOutgoing(
  nodeNumbers: string[],
  dependencies: DependencyRelation[],
): Map<string, string[]> {
  const nodeSet = new Set(nodeNumbers);
  const outgoing = new Map<string, string[]>();
  for (const { fromNumber, toNumber } of dependencies) {
    if (!nodeSet.has(fromNumber) || !nodeSet.has(toNumber)) continue;
    upsert(outgoing, fromNumber, () => []).push(toNumber);
  }
  return outgoing;
}

export function computeDepths(
  nodeNumbers: string[],
  dependencies: DependencyRelation[],
): Map<string, number> {
  const outgoing = buildOutgoing(nodeNumbers, dependencies);
  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  function resolve(node: string): number {
    if (depths.has(node)) return depths.get(node)!;
    if (visiting.has(node)) {
      depths.set(node, 0);
      return 0;
    }
    visiting.add(node);
    const deps = outgoing.get(node);
    let depth = 0;
    if (deps && deps.length > 0) {
      let maxDepth = 0;
      for (const dep of deps) {
        maxDepth = Math.max(maxDepth, resolve(dep));
      }
      depth = 1 + maxDepth;
    }
    depths.set(node, depth);
    visiting.delete(node);
    return depth;
  }

  for (const node of nodeNumbers) {
    resolve(node);
  }
  return depths;
}

export function autoLayoutPositions(
  nodes: ForestTicket[],
  dependencies: DependencyRelation[],
): ForestLayout {
  const nodeNumbers = nodes.map(n => n.number);
  const depths = computeDepths(nodeNumbers, dependencies);
  const outgoing = buildOutgoing(nodeNumbers, dependencies);

  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  const rows: Map<number, string[]> = new Map();
  for (const node of nodeNumbers) {
    const d = depths.get(node) ?? 0;
    upsert(rows, d, () => []).push(node);
  }

  const result: ForestLayout = {};

  for (let d = 0; d <= maxDepth; d++) {
    const row = [...(rows.get(d) ?? [])].sort((a, b) => a.localeCompare(b));
    const y = d > 0 ? -d * ROW_GAP : 0;

    const occupiedInRow: number[] = [];
    for (const node of row) {
      const deps = outgoing.get(node);
      let candidateX = occupiedInRow.length > 0 ? Math.max(...occupiedInRow) + H_GAP : 0;

      if (deps?.length) {
        const depPositions = deps
          .map(dep => result[dep])
          .filter((position): position is { x: number; y: number } => position !== undefined);
        if (depPositions.length > 0) {
          candidateX = depPositions.reduce((sum, position) => sum + position.x, 0)
            / depPositions.length;
        }
      }

      while (occupiedInRow.some(ox => Math.abs(ox - candidateX) < H_GAP)) {
        candidateX += H_GAP;
      }

      result[node] = { x: candidateX, y };
      occupiedInRow.push(candidateX);
    }
  }

  return result;
}
