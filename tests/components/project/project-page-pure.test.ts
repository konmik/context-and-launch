import { describe, it, expect } from 'vitest'
import { parseSyncResult } from '../../../src/components/project/project-page-pure.js'
import { success, failure } from '~/util/result.js'

describe('parseSyncResult', () => {
  it('returns success for status success', () => {
    expect(
      parseSyncResult({
        status: 'success',
      }),
    ).toEqual(
      success({
        type: 'success',
      }),
    )
  })
  it('returns conflict for status conflict', () => {
    expect(
      parseSyncResult({
        status: 'conflict',
      }),
    ).toEqual(
      success({
        type: 'conflict',
      }),
    )
  })
  it('returns error with message for status error', () => {
    expect(
      parseSyncResult({
        status: 'error',
        message: 'Oops',
      }),
    ).toEqual(failure({ title: 'Sync failed', description: 'Oops' }))
  })
  it('uses fallback message for error without message', () => {
    expect(
      parseSyncResult({
        status: 'error',
      }),
    ).toEqual(failure({ title: 'Sync failed', description: 'Sync failed' }))
  })
  it('returns error for unexpected status', () => {
    expect(
      parseSyncResult({
        status: 'unknown',
      }),
    ).toEqual(failure({ title: 'Sync failed', description: 'Sync failed' }))
  })
})
