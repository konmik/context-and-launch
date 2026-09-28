import { describe, it, expect } from 'vitest'
import {
  buildLookup,
  effectiveParent,
  resolveScope,
  isGroup,
  representativeInScope,
  internalDependencies,
  externalDependencies,
  computeDepths,
  autoLayoutPositions,
  CARD_WIDTH,
  ROW_GAP,
  H_GAP,
  type ForestTask,
} from '../../../src/components/forest/forest-graph.js'

function task(
  number: string,
  opts?: {
    dependsOn?: string[]
    memberOf?: string
  },
): ForestTask {
  return {
    number,
    title: number,
    status: 'todo',
    folderName: number.toLowerCase(),
    dependsOn: opts?.dependsOn,
    memberOf: opts?.memberOf,
  }
}

describe('effectiveParent', () => {
  it('returns memberOf when the parent exists in the list', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
    ]
    expect(effectiveParent(tasks[1], buildLookup(tasks).allNumbers)).toBe('G')
  })
  it('returns undefined when memberOf references an absent task', () => {
    const tasks = [
      task('A', {
        memberOf: 'MISSING',
      }),
    ]
    expect(effectiveParent(tasks[0], buildLookup(tasks).allNumbers)).toBeUndefined()
  })
  it('returns undefined when memberOf is not set', () => {
    const tasks = [task('A')]
    expect(effectiveParent(tasks[0], buildLookup(tasks).allNumbers)).toBeUndefined()
  })
})
describe('resolveScope', () => {
  it('returns root-level tasks for undefined scope', () => {
    const tasks = [
      task('A'),
      task('B', {
        memberOf: 'G',
      }),
      task('G'),
    ]
    const scope = resolveScope(tasks, undefined)
    expect(scope.map((t) => t.number).sort()).toEqual(['A', 'G'])
  })
  it('returns group members for a group scope', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
      task('B', {
        memberOf: 'G',
      }),
      task('C'),
    ]
    const scope = resolveScope(tasks, 'G')
    expect(scope.map((t) => t.number).sort()).toEqual(['A', 'B'])
  })
  it('treats absent parent as root-level', () => {
    const tasks = [
      task('A', {
        memberOf: 'GONE',
      }),
    ]
    const scope = resolveScope(tasks, undefined)
    expect(scope.map((t) => t.number)).toEqual(['A'])
  })
})
describe('isGroup', () => {
  it('returns true when tasks have this as their parent', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
    ]
    expect(isGroup(tasks, 'G')).toBe(true)
  })
  it('returns false when no task has this as parent', () => {
    const tasks = [task('G'), task('A')]
    expect(isGroup(tasks, 'G')).toBe(false)
  })
  it('returns false when members are absent (archived)', () => {
    const tasks = [task('G')]
    expect(isGroup(tasks, 'G')).toBe(false)
  })
})
describe('representativeInScope', () => {
  it('returns the task itself when it is directly in scope', () => {
    const tasks = [task('A'), task('B')]
    expect(representativeInScope(buildLookup(tasks), 'A', undefined)).toBe('A')
  })
  it('climbs to the group that is in the root scope', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
    ]
    expect(representativeInScope(buildLookup(tasks), 'A', undefined)).toBe('G')
  })
  it('returns the member when in a group scope', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
    ]
    expect(representativeInScope(buildLookup(tasks), 'A', 'G')).toBe('A')
  })
  it('returns undefined for a task outside the scope subtree', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
      task('X'),
    ]
    expect(representativeInScope(buildLookup(tasks), 'X', 'G')).toBeUndefined()
  })
  it('handles nested groups', () => {
    const tasks = [
      task('G1'),
      task('G2', {
        memberOf: 'G1',
      }),
      task('A', {
        memberOf: 'G2',
      }),
    ]
    const lookup = buildLookup(tasks)
    expect(representativeInScope(lookup, 'A', undefined)).toBe('G1')
    expect(representativeInScope(lookup, 'A', 'G1')).toBe('G2')
    expect(representativeInScope(lookup, 'A', 'G2')).toBe('A')
  })
  it('guards against cycles in the membership chain', () => {
    const tasks = [
      task('A', {
        memberOf: 'B',
      }),
      task('B', {
        memberOf: 'A',
      }),
    ]
    expect(representativeInScope(buildLookup(tasks), 'A', undefined)).toBeUndefined()
  })
})
describe('internalDependencies', () => {
  it('returns direct dependencies in scope', () => {
    const tasks = [
      task('A'),
      task('B', {
        dependsOn: ['A'],
      }),
    ]
    const result = internalDependencies(tasks, undefined)
    expect(result).toEqual([
      {
        fromNumber: 'B',
        toNumber: 'A',
        relations: [
          {
            fromNumber: 'B',
            toNumber: 'A',
          },
        ],
      },
    ])
  })
  it('reroutes dependencies through group representatives', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
      task('B', {
        dependsOn: ['A'],
      }),
    ]
    const result = internalDependencies(tasks, undefined)
    expect(result).toEqual([
      {
        fromNumber: 'B',
        toNumber: 'G',
        relations: [
          {
            fromNumber: 'B',
            toNumber: 'A',
          },
        ],
      },
    ])
  })
  it('deduplicates dependencies that map to the same representatives', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
      task('C', {
        memberOf: 'G',
      }),
      task('B', {
        dependsOn: ['A', 'C'],
      }),
    ]
    const result = internalDependencies(tasks, undefined)
    expect(result).toEqual([
      {
        fromNumber: 'B',
        toNumber: 'G',
        relations: [
          {
            fromNumber: 'B',
            toNumber: 'A',
          },
          {
            fromNumber: 'B',
            toNumber: 'C',
          },
        ],
      },
    ])
  })
  it('drops dependencies where from and to map to the same representative', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
        dependsOn: ['B'],
      }),
      task('B', {
        memberOf: 'G',
      }),
    ]
    const result = internalDependencies(tasks, undefined)
    expect(result).toEqual([])
  })
  it('ignores absent dependency references', () => {
    const tasks = [
      task('A', {
        dependsOn: ['MISSING'],
      }),
    ]
    const result = internalDependencies(tasks, undefined)
    expect(result).toEqual([])
  })
})
describe('externalDependencies', () => {
  it('returns empty for root scope', () => {
    const tasks = [
      task('A'),
      task('B', {
        dependsOn: ['A'],
      }),
    ]
    expect(externalDependencies(tasks, undefined)).toEqual([])
  })
  it('returns down when member depends on outside task', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
        dependsOn: ['X'],
      }),
      task('X'),
    ]
    const result = externalDependencies(tasks, 'G')
    expect(result).toEqual([
      {
        memberNumber: 'A',
        direction: 'down',
        relations: [
          {
            fromNumber: 'A',
            toNumber: 'X',
          },
        ],
      },
    ])
  })
  it('returns up when outside task depends on member', () => {
    const tasks = [
      task('G'),
      task('A', {
        memberOf: 'G',
      }),
      task('X', {
        dependsOn: ['A'],
      }),
    ]
    const result = externalDependencies(tasks, 'G')
    expect(result).toEqual([
      {
        memberNumber: 'A',
        direction: 'up',
        relations: [
          {
            fromNumber: 'X',
            toNumber: 'A',
          },
        ],
      },
    ])
  })
})
describe('computeDepths', () => {
  it('assigns depth 0 to nodes with no dependencies', () => {
    const depths = computeDepths(['A', 'B'], [])
    expect(depths.get('A')).toBe(0)
    expect(depths.get('B')).toBe(0)
  })
  it('assigns depth 1 to a direct dependent', () => {
    const depths = computeDepths(
      ['A', 'B'],
      [
        {
          fromNumber: 'B',
          toNumber: 'A',
        },
      ],
    )
    expect(depths.get('A')).toBe(0)
    expect(depths.get('B')).toBe(1)
  })
  it('assigns depth based on max dependency depth (above every one of them)', () => {
    const deps = [
      {
        fromNumber: 'C',
        toNumber: 'A',
      },
      {
        fromNumber: 'C',
        toNumber: 'B',
      },
      {
        fromNumber: 'B',
        toNumber: 'A',
      },
    ]
    const depths = computeDepths(['A', 'B', 'C'], deps)
    expect(depths.get('A')).toBe(0)
    expect(depths.get('B')).toBe(1)
    expect(depths.get('C')).toBe(2)
  })
  it('handles transitive chains', () => {
    const deps = [
      {
        fromNumber: 'D',
        toNumber: 'C',
      },
      {
        fromNumber: 'C',
        toNumber: 'B',
      },
      {
        fromNumber: 'B',
        toNumber: 'A',
      },
    ]
    const depths = computeDepths(['A', 'B', 'C', 'D'], deps)
    expect(depths.get('A')).toBe(0)
    expect(depths.get('B')).toBe(1)
    expect(depths.get('C')).toBe(2)
    expect(depths.get('D')).toBe(3)
  })
  it('guards against cycles without crashing', () => {
    const deps = [
      {
        fromNumber: 'A',
        toNumber: 'B',
      },
      {
        fromNumber: 'B',
        toNumber: 'A',
      },
    ]
    const depths = computeDepths(['A', 'B'], deps)
    expect(depths.get('A')).toBeDefined()
    expect(depths.get('B')).toBeDefined()
  })
})
describe('autoLayoutPositions', () => {
  it('places bottom row at y=0', () => {
    const nodes = [task('A'), task('B')]
    const result = autoLayoutPositions(nodes, [])
    expect(result['A'].y).toBe(0)
    expect(result['B'].y).toBe(0)
  })
  it('places dependent above its dependency', () => {
    const nodes = [
      task('A'),
      task('B', {
        dependsOn: ['A'],
      }),
    ]
    const deps = [
      {
        fromNumber: 'B',
        toNumber: 'A',
      },
    ]
    const result = autoLayoutPositions(nodes, deps)
    expect(result['A'].y).toBe(0)
    expect(result['B'].y).toBe(-ROW_GAP)
  })
  it('does not overlap nodes in the same row', () => {
    const nodes = [task('A'), task('B'), task('C')]
    const result = autoLayoutPositions(nodes, [])
    const xs = [result['A'].x, result['B'].x, result['C'].x].sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(H_GAP)
    }
  })
  it('is deterministic (sorted by task number)', () => {
    const nodes = [task('C'), task('A'), task('B')]
    const result1 = autoLayoutPositions(nodes, [])
    const result2 = autoLayoutPositions([task('B'), task('C'), task('A')], [])
    expect(result1).toEqual(result2)
  })
  it('centers a dependent above its dependency', () => {
    const nodes = [
      task('A'),
      task('B', {
        dependsOn: ['A'],
      }),
    ]
    const deps = [
      {
        fromNumber: 'B',
        toNumber: 'A',
      },
    ]
    const result = autoLayoutPositions(nodes, deps)
    expect(result['B'].x).toBe(result['A'].x)
  })
})
