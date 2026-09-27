import * as v from 'valibot'
import { createTicketRepository, type TicketRepository } from './ticket-repository.js'

export interface ForestLayoutValue {
  x: number
  y: number
}

export interface ForestLayout extends Record<string, ForestLayoutValue> {}

const PositionSchema = v.object({
  x: v.number(),
  y: v.number(),
})

const ForestLayoutRecordSchema = v.record(v.string(), v.unknown())

export interface ForestLayoutStore {
  read(): ForestLayout
  renameTicket(oldTicketNumber: string, newTicketNumber: string): void
  removeTicket(ticketNumber: string): void
  translateIntoGroup(
    groupNumber: string,
    groupPosition: {
      x: number
      y: number
    },
    memberNumbers: string[],
  ): void
  translateOutOfGroup(groupNumber: string, memberNumbers: string[]): void
  write(layout: ForestLayout, expected?: ForestLayout): void
}

export function createForestLayoutStore(worktreeDir: string, repo: TicketRepository = createTicketRepository()): ForestLayoutStore {
  function read(): ForestLayout {
    const raw = repo.readWorktreeJson(worktreeDir, 'forest-layout.json')
    const record = v.safeParse(ForestLayoutRecordSchema, raw)
    if (!record.success) return {}
    const result: ForestLayout = {}
    for (const [ticketNumber, value] of Object.entries(record.output)) {
      const parsed = v.safeParse(PositionSchema, value)
      if (parsed.success) result[ticketNumber] = parsed.output
    }
    return result
  }

  function renameTicket(oldTicketNumber: string, newTicketNumber: string): void {
    const layout = read()
    if (!(oldTicketNumber in layout)) return
    const { [oldTicketNumber]: position, ...remaining } = layout
    write({
      ...remaining,
      [newTicketNumber]: position,
    })
  }

  function removeTicket(ticketNumber: string): void {
    const layout = read()
    if (!(ticketNumber in layout)) return
    write(Object.fromEntries(Object.entries(layout).filter(([number]) => number !== ticketNumber)))
  }

  function translateIntoGroup(
    groupNumber: string,
    groupPosition: {
      x: number
      y: number
    },
    memberNumbers: string[],
  ): void {
    const layout = read()
    const next = {
      ...layout,
      [groupNumber]: groupPosition,
    }
    for (const memberNumber of memberNumbers) {
      const memberPosition = layout[memberNumber]
      if (memberPosition) {
        next[memberNumber] = {
          x: memberPosition.x - groupPosition.x,
          y: memberPosition.y - groupPosition.y,
        }
      }
    }
    write(next)
  }

  function translateOutOfGroup(groupNumber: string, memberNumbers: string[]): void {
    const layout = read()
    const groupPosition = layout[groupNumber]
    const next = {
      ...layout,
    }
    const positionedMembers = memberNumbers.filter((number) => layout[number])
    if (!positionedMembers.length) return
    for (const memberNumber of positionedMembers) {
      const memberPosition = layout[memberNumber]
      if (groupPosition) {
        next[memberNumber] = {
          x: groupPosition.x + memberPosition.x,
          y: groupPosition.y + memberPosition.y,
        }
      } else {
        delete next[memberNumber]
      }
    }
    write(next)
  }

  function write(layout: ForestLayout, expected?: ForestLayout): void {
    if (expected && JSON.stringify(read()) !== JSON.stringify(expected)) {
      throw new Error('Forest layout changed in another request. Try again.')
    }
    repo.writeWorktreeJson(worktreeDir, 'forest-layout.json', layout)
  }

  return {
    read,
    renameTicket,
    removeTicket,
    translateIntoGroup,
    translateOutOfGroup,
    write,
  }
}
