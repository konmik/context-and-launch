import type { ColumnDefinition } from '~/core/project/board-config.js'
import { slugifyColumnName } from '~/lib/slugify.js'
import { createValidationError, errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export function usesWindowsBatchCommand(command: string): boolean {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.some((token) => {
    const value = token.replace(/^["']|["']$/g, '').toLowerCase()
    const basename = value.split(/[\\/]/).at(-1)
    return basename === 'cmd' || basename === 'cmd.exe' || value.endsWith('.cmd') || value.endsWith('.bat')
  })
}

export function validateColumnName(name: string, mode: 'add' | 'edit', oldName: string | undefined, columns: ColumnDefinition[]): UserFacingError | undefined {
  const slugified = slugifyColumnName(name)
  if (!slugified) return name.trim() ? errorPayload(createValidationError('Name resolves to empty after slugification', 'name')) : undefined
  if (slugified === 'undefined') return errorPayload(createValidationError('Name "undefined" is reserved', 'name'))
  const others = mode === 'edit' && oldName ? columns.filter((c) => c.name !== oldName) : columns
  if (others.some((c) => c.name === slugified)) return errorPayload(createValidationError(`Name "${slugified}" already exists`, 'name'))
  return undefined
}
