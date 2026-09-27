import { describe, it, expect } from 'vitest'
import { escapeBatchTitle } from '../shared/batch-escape.js'
import { parseLaunchRequest } from './launch-request.js'

describe('escapeBatchTitle - batch metacharacter injection', () => {
  it('strips ampersand to prevent command chaining', () => {
    const result = escapeBatchTitle('foo & whoami')
    expect(result).toBe('foo  whoami')
    expect(result).not.toContain('&')
  })
  it('strips pipe to prevent piping output', () => {
    const result = escapeBatchTitle('test | dir')
    expect(result).toBe('test  dir')
    expect(result).not.toContain('|')
  })
  it('strips angle brackets to prevent redirection', () => {
    const result = escapeBatchTitle('a > output.txt')
    expect(result).toBe('a  output.txt')
    expect(result).not.toContain('>')
    expect(result).not.toContain('<')
  })
  it('strips percent signs to prevent variable expansion', () => {
    const result = escapeBatchTitle('%PATH%')
    expect(result).toBe('PATH')
    expect(result).not.toContain('%')
  })
  it('strips caret to prevent escape sequences', () => {
    const result = escapeBatchTitle('hello^world')
    expect(result).toBe('helloworld')
    expect(result).not.toContain('^')
  })
  it('strips CR/LF to prevent line injection', () => {
    const result = escapeBatchTitle('line1\r\nline2')
    expect(result).toBe('line1line2')
    expect(result).not.toContain('\r')
    expect(result).not.toContain('\n')
  })
  it('strips double quotes', () => {
    const result = escapeBatchTitle('say "hello"')
    expect(result).toBe('say hello')
    expect(result).not.toContain('"')
  })
  it('preserves safe characters intact', () => {
    const safe = "My Ticket Title - Feature (v2) [draft] 'quoted'"
    expect(escapeBatchTitle(safe)).toBe(safe)
  })
  it('handles a combination of multiple metacharacters', () => {
    const result = escapeBatchTitle('a & b | c > d < e ^ f % g "h"') // Only safe chars and spaces remain
    expect(result).not.toMatch(/[&|><^%"]/)
    expect(result).toBe('a  b  c  d  e  f  g h')
  })
})
describe('parseLaunchRequest with missing/malformed request body', () => {
  const DEFAULTS = {
    initialPrompt: '',
    useWorktree: false,
    profileName: '',
    force: false,
    skipBehindRemote: false,
    launchDir: '',
  }
  it('undefined body returns all defaults', () => {
    const result = parseLaunchRequest(undefined)
    expect(result).toEqual(DEFAULTS)
  })
  it('null body returns all defaults', () => {
    const result = parseLaunchRequest(null)
    expect(result).toEqual(DEFAULTS)
  })
  it('empty object body returns all defaults', () => {
    const result = parseLaunchRequest({})
    expect(result).toEqual(DEFAULTS)
  })
  it('string body returns all defaults (non-object)', () => {
    const result = parseLaunchRequest('hello')
    expect(result).toEqual(DEFAULTS)
  })
  it('number body returns all defaults (non-object)', () => {
    const result = parseLaunchRequest(42)
    expect(result).toEqual(DEFAULTS)
  })
  it('boolean body returns all defaults (non-object)', () => {
    const result = parseLaunchRequest(true)
    expect(result).toEqual(DEFAULTS)
  })
  it('array body is treated as object but has no matching keys, returns defaults', () => {
    const result = parseLaunchRequest(['a', 'b'])
    expect(result).toEqual(DEFAULTS)
  })
  it('body with wrong types for all fields returns defaults', () => {
    const result = parseLaunchRequest({
      initialPrompt: 123,
      useWorktree: 'yes',
    })
    expect(result).toEqual(DEFAULTS)
  })
  it('body with valid fields overrides defaults', () => {
    const result = parseLaunchRequest({
      initialPrompt: 'do the thing',
      useWorktree: true,
    })
    expect(result).toEqual({
      initialPrompt: 'do the thing',
      useWorktree: true,
      profileName: '',
      force: false,
      skipBehindRemote: false,
      launchDir: '',
    })
  })
  it('body with partial valid fields merges with defaults', () => {
    const result = parseLaunchRequest({
      initialPrompt: 'hello',
    })
    expect(result).toEqual({
      initialPrompt: 'hello',
      useWorktree: false,
      profileName: '',
      force: false,
      skipBehindRemote: false,
      launchDir: '',
    })
  })
  it('body with extra unknown fields does not affect result', () => {
    const result = parseLaunchRequest({
      initialPrompt: 'do it',
      unknownField: 'ignored',
      anotherField: 999,
    })
    expect(result.initialPrompt).toBe('do it')
    expect(result.useWorktree).toBe(false)
    expect(result).not.toHaveProperty('unknownField')
    expect(result).not.toHaveProperty('anotherField')
  })
  it('never throws for any input', () => {
    const inputs = [undefined, null, 0, '', false, NaN, Infinity, [], {}, 'json', 42, true]
    for (const input of inputs) {
      expect(() => parseLaunchRequest(input)).not.toThrow()
    }
  })
})
