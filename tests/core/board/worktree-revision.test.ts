import { describe, it, expect } from 'vitest'
import { createWorktreeRevisionStore } from '../../../src/core/board/worktree-revision.js'

describe('WorktreeRevisionStore', () => {
  it('starts every worktree at zero', () => {
    const revisions = createWorktreeRevisionStore()
    expect(revisions.current('/wt')).toBe(0)
  })
  it('advances the revision on every change', () => {
    const revisions = createWorktreeRevisionStore()
    expect(revisions.bump('/wt')).toBe(1)
    expect(revisions.bump('/wt')).toBe(2)
    expect(revisions.current('/wt')).toBe(2)
  })
  it('tracks worktrees independently', () => {
    const revisions = createWorktreeRevisionStore()
    revisions.bump('/a')
    expect(revisions.current('/a')).toBe(1)
    expect(revisions.current('/b')).toBe(0)
  })
})
