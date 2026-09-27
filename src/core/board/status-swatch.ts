export interface SwatchColumn {
  name: string
  color?: string
}

export interface ColumnColorStatusSwatchAppearance {
  kind: 'column-color'
  hex: string
}

export interface OrphanStatusStatusSwatchAppearance {
  kind: 'orphan-status'
}

export interface NoneStatusSwatchAppearance {
  kind: 'none'
}

export type StatusSwatchAppearance = ColumnColorStatusSwatchAppearance | OrphanStatusStatusSwatchAppearance | NoneStatusSwatchAppearance

export function resolveStatusSwatch(ticketStatus: string, columns: SwatchColumn[]): StatusSwatchAppearance {
  const column = columns.find((c) => c.name === ticketStatus)
  if (!column)
    return {
      kind: 'orphan-status',
    }
  if (!column.color)
    return {
      kind: 'none',
    }
  return {
    kind: 'column-color',
    hex: column.color,
  }
}
