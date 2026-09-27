import * as v from 'valibot'
import { failure, type Failure } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export type ErrorInfo = UserFacingError

export interface AppError extends Error, UserFacingError {}

export interface ValidationError extends AppError {}

export interface NotFoundError extends AppError {}

const appErrors = new WeakSet<AppError>()

const validationErrors = new WeakSet<ValidationError>()

export function createAppError(message: string, title = 'Operation failed', field?: string): AppError {
  const error: AppError = Object.assign(new Error(message), { title, description: message })
  if (field) Object.assign(error, { field })
  error.name = 'AppError'
  appErrors.add(error)
  return error
}

export function isAppError(cause: unknown): cause is AppError {
  return cause instanceof Error && appErrors.has(cause)
}

export function createValidationError(message: string, field?: string): ValidationError {
  const error = createAppError(message, 'Invalid input', field)
  error.name = 'ValidationError'
  validationErrors.add(error)
  return error
}

export function isValidationError(cause: unknown): cause is ValidationError {
  return isAppError(cause) && validationErrors.has(cause)
}

export function createNotFoundError(message: string): NotFoundError {
  const error = createAppError(message, 'Not found')
  error.name = 'NotFoundError'
  return error
}

/**
 * Why a command failed, as classified at the shell boundary.
 *
 * `exited` is the only kind whose `exitCode` was chosen by the command itself,
 * so it is the only kind a caller may interpret as a probe answer. Every other
 * kind means the command never produced a verdict. Without this distinction a
 * caller cannot tell "git says these commits are unrelated" from "git is not
 * installed", because both surface as a non-zero exit.
 */
export type ProcessFailureKind = 'exited' | 'command-not-found' | 'interpreter-failure' | 'timeout' | 'spawn-error'

export interface ProcessError extends Error {
  readonly shortDescription: string
  readonly command: string
  readonly exitCode: number | undefined
  readonly output: string | undefined
  readonly kind: ProcessFailureKind
  /** True when the command ran to completion and chose `code` itself. */
  exitedWith(code: number): boolean
}

const processErrors = new WeakSet<Error>()

export function createProcessError(
  command: string,
  exitCode: number | undefined,
  output: string | undefined,
  description?: string,
  kind: ProcessFailureKind = 'exited',
): ProcessError {
  const shortDescription = description ?? `${command} failed${exitCode != null ? ` (exit ${exitCode})` : ''}`
  const error = Object.assign(new Error(output ? `${shortDescription}: ${output}` : shortDescription), {
    name: 'ProcessError',
    shortDescription,
    command,
    exitCode,
    output,
    kind,
    exitedWith: (code: number): boolean => kind === 'exited' && exitCode === code,
  })
  processErrors.add(error)
  return error
}

export function isProcessError(cause: unknown): cause is ProcessError {
  return cause instanceof Error && processErrors.has(cause)
}

const ErrorMessageSchema = v.object({
  message: v.string(),
})

export const UserFacingErrorSchema = v.object({
  title: v.string(),
  description: v.string(),
  details: v.optional(v.string()),
  field: v.optional(v.string()),
})

export function errorMessage(cause: unknown): string {
  const userError = v.safeParse(UserFacingErrorSchema, cause)
  if (userError.success) return userError.output.description
  if (cause instanceof Error) return cause.message
  const stringResult = v.safeParse(v.string(), cause)
  if (stringResult.success) return stringResult.output
  const objectResult = v.safeParse(ErrorMessageSchema, cause)
  if (objectResult.success) return objectResult.output.message
  return 'Unknown error'
}

export interface ActionError extends UserFacingError {
  type: 'error'
}

export function errorResult(cause: unknown): Failure<ActionError> {
  return failure({
    type: 'error' as const,
    ...errorPayload(cause),
  })
}

export function errorPayload(cause: unknown, title = 'Operation failed'): UserFacingError {
  const userError = v.safeParse(UserFacingErrorSchema, cause)
  if (userError.success) return userError.output
  if (isProcessError(cause)) {
    return {
      title,
      description: cause.shortDescription,
      details: `Command\n${cause.command}${cause.output ? `\n\nOutput\n${cause.output}` : ''}`,
    }
  }
  return {
    title,
    description: errorMessage(cause),
  }
}
