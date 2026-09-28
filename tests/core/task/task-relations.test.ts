import { describe, it, expect } from 'vitest'
import {
  wouldCreateDependencyCycle,
  wouldCreateMembershipCycle,
  rewriteInboundReferences,
  removeInboundReferences,
} from '../../../src/core/task/task-relations.js'
import type { StatusJson } from '../../../src/core/task/task-repository.js'

describe('wouldCreateDependencyCycle', () => {
  it('detects a direct cycle', () => {
    const tasks = [
      {
        number: 'A',
        dependsOn: ['B'],
      },
      {
        number: 'B',
      },
    ]
    expect(wouldCreateDependencyCycle(tasks, 'B', 'A')).toBe(true)
  })
  it('detects a transitive cycle', () => {
    const tasks = [
      {
        number: 'A',
        dependsOn: ['B'],
      },
      {
        number: 'B',
        dependsOn: ['C'],
      },
      {
        number: 'C',
      },
    ]
    expect(wouldCreateDependencyCycle(tasks, 'C', 'A')).toBe(true)
  })
  it('detects a self-cycle', () => {
    const tasks = [
      {
        number: 'A',
      },
    ]
    expect(wouldCreateDependencyCycle(tasks, 'A', 'A')).toBe(true)
  })
  it('returns false when no cycle', () => {
    const tasks = [
      {
        number: 'A',
      },
      {
        number: 'B',
      },
      {
        number: 'C',
        dependsOn: ['A'],
      },
    ]
    expect(wouldCreateDependencyCycle(tasks, 'B', 'A')).toBe(false)
  })
  it('tolerates absent references', () => {
    const tasks = [
      {
        number: 'A',
        dependsOn: ['MISSING'],
      },
      {
        number: 'B',
      },
    ]
    expect(wouldCreateDependencyCycle(tasks, 'B', 'A')).toBe(false)
  })
})
describe('wouldCreateMembershipCycle', () => {
  it('detects a cycle through parent chain', () => {
    const tasks = [
      {
        number: 'G1',
        memberOf: 'G2',
      },
      {
        number: 'G2',
      },
      {
        number: 'A',
      },
    ]
    expect(wouldCreateMembershipCycle(tasks, ['G2'], 'G1')).toBe(true)
  })
  it('returns false when no cycle', () => {
    const tasks = [
      {
        number: 'G1',
      },
      {
        number: 'A',
      },
      {
        number: 'B',
      },
    ]
    expect(wouldCreateMembershipCycle(tasks, ['A', 'B'], 'G1')).toBe(false)
  })
  it('tolerates absent references in parent chain', () => {
    const tasks = [
      {
        number: 'G1',
        memberOf: 'MISSING',
      },
      {
        number: 'A',
      },
    ]
    expect(wouldCreateMembershipCycle(tasks, ['A'], 'G1')).toBe(false)
  })
  it('detects when group is among members', () => {
    const tasks = [
      {
        number: 'G1',
      },
    ]
    expect(wouldCreateMembershipCycle(tasks, ['G1'], 'G1')).toBe(true)
  })
})
describe('rewriteInboundReferences', () => {
  const base: StatusJson = {
    number: 'X',
    title: 'X',
    status: 'todo',
    useWorktree: false,
  }
  it('rewrites dependsOn only', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['OLD', 'OTHER'],
    }
    const result = rewriteInboundReferences(status, 'OLD', 'NEW')
    expect(result).toBeDefined()
    expect(result!.dependsOn).toEqual(['NEW', 'OTHER'])
    expect(result!.memberOf).toBeUndefined()
  })
  it('rewrites memberOf only', () => {
    const status: StatusJson = {
      ...base,
      memberOf: 'OLD',
    }
    const result = rewriteInboundReferences(status, 'OLD', 'NEW')
    expect(result).toBeDefined()
    expect(result!.memberOf).toBe('NEW')
  })
  it('rewrites both dependsOn and memberOf', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['OLD'],
      memberOf: 'OLD',
    }
    const result = rewriteInboundReferences(status, 'OLD', 'NEW')
    expect(result).toBeDefined()
    expect(result!.dependsOn).toEqual(['NEW'])
    expect(result!.memberOf).toBe('NEW')
  })
  it('returns undefined when nothing references oldNumber', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['OTHER'],
      memberOf: 'ANOTHER',
    }
    expect(rewriteInboundReferences(status, 'OLD', 'NEW')).toBeUndefined()
  })
  it('returns undefined for status with no relations', () => {
    expect(rewriteInboundReferences(base, 'OLD', 'NEW')).toBeUndefined()
  })
})
describe('removeInboundReferences', () => {
  const base: StatusJson = {
    number: 'X',
    title: 'X',
    status: 'todo',
    useWorktree: false,
  }
  it('removes from dependsOn and drops field when empty', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['GONE'],
    }
    const result = removeInboundReferences(status, 'GONE')
    expect(result).toBeDefined()
    expect(result!.dependsOn).toBeUndefined()
  })
  it('removes from dependsOn keeping remaining entries', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['GONE', 'KEEP'],
    }
    const result = removeInboundReferences(status, 'GONE')
    expect(result).toBeDefined()
    expect(result!.dependsOn).toEqual(['KEEP'])
  })
  it('removes memberOf', () => {
    const status: StatusJson = {
      ...base,
      memberOf: 'GONE',
    }
    const result = removeInboundReferences(status, 'GONE')
    expect(result).toBeDefined()
    expect(result!.memberOf).toBeUndefined()
  })
  it('removes both dependsOn and memberOf', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['GONE'],
      memberOf: 'GONE',
    }
    const result = removeInboundReferences(status, 'GONE')
    expect(result).toBeDefined()
    expect(result!.dependsOn).toBeUndefined()
    expect(result!.memberOf).toBeUndefined()
  })
  it('returns undefined when nothing references removedNumber', () => {
    const status: StatusJson = {
      ...base,
      dependsOn: ['OTHER'],
      memberOf: 'ANOTHER',
    }
    expect(removeInboundReferences(status, 'GONE')).toBeUndefined()
  })
  it('returns undefined for status with no relations', () => {
    expect(removeInboundReferences(base, 'GONE')).toBeUndefined()
  })
})
