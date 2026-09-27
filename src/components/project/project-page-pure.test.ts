import { describe, it, expect } from 'vitest'
import { parseSyncResult } from './project-page-pure.js'
import { succeed, fail } from '~/util/result.js'

describe('parseSyncResult', () => {
  it('returns success for status success', () => {
    expect(
      parseSyncResult({
        status: 'success',
      }),
    ).toEqual(
      succeed({
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
      succeed({
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
    ).toEqual(fail('Oops'))
  })
  it('uses fallback message for error without message', () => {
    expect(
      parseSyncResult({
        status: 'error',
      }),
    ).toEqual(fail('Sync failed'))
  })
  it('returns error for unexpected status', () => {
    expect(
      parseSyncResult({
        status: 'unknown',
      }),
    ).toEqual(fail('Sync failed'))
  })
})
