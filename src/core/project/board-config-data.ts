import * as v from 'valibot'
import { createValidationError, createAppError } from '../shared/errors.js'
import type { JsonValue } from '../shared/json.js'
import { slugifyColumnName } from '../../lib/slugify.js'
import { requireColumnColor } from './column-color-palette.js'

export interface ColumnDefinition {
  name: string
  description?: string
  color?: string
}

export interface BoardDefinition {
  id: string
  name: string
  columns: ColumnDefinition[]
}

const schema = v.array(
  v.looseObject({
    id: v.string(),
    name: v.string(),
    columns: v.array(
      v.looseObject({
        name: v.string(),
        description: v.optional(v.string()),
        color: v.optional(v.string()),
      }),
    ),
  }),
)

export function decodeBoards(raw: JsonValue): BoardDefinition[] {
  const parsed = v.safeParse(schema, raw)
  if (!parsed.success || !parsed.output.length) throw createAppError('boards.json is empty or not an array', 'Invalid board configuration')
  return parsed.output
}

export function validateColumnName(name: string, existingNames: string[], renamingFrom?: string): string {
  const columnSlug = slugifyColumnName(name)
  if (!columnSlug) throw createValidationError('Column name must not be empty', 'name')
  if (columnSlug === 'undefined') throw createValidationError('Column name "undefined" is reserved', 'name')
  if (existingNames.some((n) => n !== renamingFrom && n === columnSlug)) {
    throw createValidationError(`Column name "${columnSlug}" already exists`, 'name')
  }
  return columnSlug
}

export function validateBoards(boards: BoardDefinition[]): void {
  const ids = new Set<string>()
  for (const board of boards) {
    if (!board.id || board.id === 'undefined') throw createValidationError('Board id must not be empty or reserved', 'name')
    if (ids.has(board.id)) throw createValidationError(`Board with id "${board.id}" already exists`, 'name')
    ids.add(board.id)
    const names: string[] = []
    for (const column of board.columns) {
      if (validateColumnName(column.name, names) !== column.name) {
        throw createValidationError('Column name must be slugified', 'name')
      }
      names.push(column.name)
      if (column.color) requireColumnColor(column.color)
    }
  }
}
