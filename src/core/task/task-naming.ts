import { createValidationError } from '../shared/errors.js'

export function toKebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeTaskNumber(taskNumber: string): string {
  return taskNumber.trim().toLowerCase()
}

export function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw createValidationError(`${label} must not be blank`)
  return trimmed
}

export function requireSimpleName(name: string, label: string): void {
  if (name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
    throw createValidationError(`${label} must be a simple name without path separators: ${name}`)
  }
}
