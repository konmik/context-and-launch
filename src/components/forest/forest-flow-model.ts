import type { ForestPosition } from './forest-types.js'
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
  type ForestLookup,
  type ForestTask,
} from './forest-graph.js'
import type { ForestLayout } from '~/core/task/forest-layout-store.js'

export interface ForestNodeData {
  task: ForestTask
  representedTaskNumbers: string[]
  group: boolean
}

export interface ForestEdgeData {
  relations: DependencyRelation[]
}

export interface ForestFlowNode {
  id: string
  position: {
    x: number
    y: number
  }
  data: ForestNodeData
}

export interface ForestFlowEdge {
  id: string
  source: string
  target: string
  data: ForestEdgeData
}

export interface ForestFlowModel {
  nodes: ForestFlowNode[]
  edges: ForestFlowEdge[]
  externalDependencies: ExternalDependencyProjection[]
  lookup: ForestLookup
}

export function buildForestFlowModel(
  tasks: ForestTask[],
  scopeGroupNumber: string | undefined,
  savedLayout: ForestLayout,
): ForestFlowModel {
  const lookup = buildLookup(tasks)
  const representativeCache = new Map<string, string | undefined>()
  const scopeNodes = resolveScope(tasks, scopeGroupNumber, lookup)
  const { internal, external } = projectDependencies(tasks, scopeGroupNumber, lookup, representativeCache)
  const representedByScopeNode = new Map<string, string[]>()
  const parentNumbers = new Set<string>()
  for (const task of tasks) {
    const representative = representativeInScope(lookup, task.number, scopeGroupNumber, representativeCache)
    if (representative) {
      const represented = representedByScopeNode.get(representative)
      if (represented) represented.push(task.number)
      else representedByScopeNode.set(representative, [task.number])
    }
    const parent = effectiveParent(task, lookup.allNumbers)
    if (parent) parentNumbers.add(parent)
  }
  const savedScopePositions: ForestLayout = {}
  let allSaved = true
  for (const task of scopeNodes) {
    const position = savedLayout[task.number]
    if (position) savedScopePositions[task.number] = position
    else allSaved = false
  }
  const positions: ForestLayout = allSaved
    ? savedScopePositions
    : {
        ...autoLayoutPositions(scopeNodes, internal),
        ...savedScopePositions,
      }
  return {
    nodes: scopeNodes.map((task) => ({
      id: task.number,
      position: positions[task.number] ?? {
        x: 0,
        y: 0,
      },
      data: {
        task,
        representedTaskNumbers: representedByScopeNode.get(task.number) ?? [],
        group: parentNumbers.has(task.number),
      },
    })),
    edges: internal.map((dependency) => ({
      id: `dependency:${dependency.fromNumber}:${dependency.toNumber}`,
      source: dependency.fromNumber,
      target: dependency.toNumber,
      data: {
        relations: dependency.relations,
      },
    })),
    externalDependencies: external,
    lookup,
  }
}

export function rearrangedForestPositions(tasks: ForestTask[], scopeGroupNumber: string | undefined): ForestLayout {
  const lookup = buildLookup(tasks)
  return autoLayoutPositions(
    resolveScope(tasks, scopeGroupNumber, lookup),
    projectDependencies(tasks, scopeGroupNumber, lookup).internal,
  )
}

export function positionsFromNodes(nodes: readonly ForestFlowNode[]): ForestLayout {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        ...node.position,
      },
    ]),
  )
}

export function groupPosition(bounds: { x: number; y: number; width: number; height: number }): ForestPosition {
  return {
    x: bounds.x + (bounds.width - CARD_WIDTH) / 2,
    y: bounds.y + (bounds.height - CARD_HEIGHT) / 2,
  }
}
