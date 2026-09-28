import type { BoardDefinition, ColumnDefinition } from '~/core/project/board-config-data.js'
import { slugifyColumnName } from '~/lib/slugify.js'
import type { UserFacingError } from '~/util/user-facing-error.js'

export const itemCollections = {
  template: 'templates',
  skill: 'skills',
  profile: 'profiles',
  shortcut: 'shortcuts',
} as const

export function updateBoardColumns(
  boards: BoardDefinition[],
  boardId: string,
  transform: (columns: ColumnDefinition[]) => ColumnDefinition[],
): BoardDefinition[] {
  if (!boards.some((board) => board.id === boardId)) throw new Error(`Board not found: ${boardId}`)
  return boards.map((board) =>
    board.id === boardId
      ? {
          ...board,
          columns: transform(board.columns),
        }
      : board,
  )
}

export function usesWindowsBatchCommand(command: string): boolean {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return tokens.some((token) => {
    const value = token.replace(/^["']|["']$/g, '').toLowerCase()
    const basename = value.split(/[\\/]/).at(-1)
    return basename === 'cmd' || basename === 'cmd.exe' || value.endsWith('.cmd') || value.endsWith('.bat')
  })
}

export function validateColumnName(
  name: string,
  mode: 'add' | 'edit',
  oldName: string | undefined,
  columns: ColumnDefinition[],
): UserFacingError | undefined {
  const slugified = slugifyColumnName(name)
  if (!slugified)
    return name.trim()
      ? {
          title: 'Invalid input',
          description: 'Name resolves to empty after slugification',
          field: 'name',
        }
      : undefined
  if (slugified === 'undefined')
    return {
      title: 'Invalid input',
      description: 'Name "undefined" is reserved',
      field: 'name',
    }
  const others = mode === 'edit' && oldName ? columns.filter((c) => c.name !== oldName) : columns
  if (others.some((c) => c.name === slugified))
    return {
      title: 'Invalid input',
      description: `Name "${slugified}" already exists`,
      field: 'name',
    }
  return undefined
}
