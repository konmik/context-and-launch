import { createAppError, isAppError, type AppError } from '../shared/errors.js'

export type HerdrUnavailableReason = 'cli-missing' | 'server-not-running'

const ERROR_BY_REASON = {
  'cli-missing': {
    title: 'Herdr CLI missing',
    description: 'Herdr is not installed or is not available on PATH.',
  },
  'server-not-running': {
    title: 'Herdr server not running',
    description: 'The Herdr server is not running.',
  },
}

/**
 * Herdr produced no answer because Herdr itself is not there. Every Herdr
 * command is a call over the Herdr server socket, so a stopped server fails the
 * same way for every command and says nothing about the command that was asked.
 * Callers whose only question is which agents exist may read this as "none".
 */
export interface HerdrUnavailableError extends AppError {
  readonly reason: HerdrUnavailableReason
}

const unavailableErrors = new WeakSet<Error>()

export function createHerdrUnavailableError(reason: HerdrUnavailableReason): HerdrUnavailableError {
  const { title, description } = ERROR_BY_REASON[reason]
  const error = Object.assign(createAppError(description, title), {
    name: 'HerdrUnavailableError',
    reason,
  })
  unavailableErrors.add(error)
  return error
}

export function isHerdrUnavailableError(cause: unknown): cause is HerdrUnavailableError {
  return isAppError(cause) && unavailableErrors.has(cause)
}
