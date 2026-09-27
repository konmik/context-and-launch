import * as v from 'valibot'
import { reconcileOrder } from './ticket-order-reconcile.js'
import { createTicketRepository, type TicketRepository } from './ticket-repository.js'
import type { TicketInfo } from './ticket-store.js'
import type { TicketOrder } from './ticket-order-data.js'

const TicketOrderSchema = v.record(v.string(), v.array(v.string()))

export interface TicketOrderStore {
  read(): TicketOrder
  write(order: TicketOrder, expected?: TicketOrder): void
  reconcileAndSave(tickets: TicketInfo[], columns: string[]): TicketOrder
  appendTicket(folderName: string, column: string): void
  removeTicket(folderName: string): void
  renameTicket(oldFolderName: string, newFolderName: string): void
}

export function createTicketOrderStore(worktreeDir: string, repo: TicketRepository = createTicketRepository()): TicketOrderStore {
  function read(): TicketOrder {
    const parsed = repo.readWorktreeJson(worktreeDir, 'ticket-order.json')
    const result = v.safeParse(TicketOrderSchema, parsed)
    return result.success ? result.output : {}
  }

  function write(order: TicketOrder, expected?: TicketOrder): void {
    if (expected && JSON.stringify(read()) !== JSON.stringify(expected)) {
      throw new Error('Ticket order changed in another request. Try again.')
    }
    repo.writeWorktreeJson(worktreeDir, 'ticket-order.json', v.parse(TicketOrderSchema, order))
  }

  function reconcileAndSave(tickets: TicketInfo[], columns: string[]): TicketOrder {
    const existing = read()
    const { order, changed } = reconcileOrder(existing, tickets, columns)
    if (changed) write(order)
    return order
  }

  function appendTicket(folderName: string, column: string): void {
    const order = read()
    const folders = order[column] ?? []
    write({
      ...order,
      [column]: folders.includes(folderName) ? folders : [...folders, folderName],
    })
  }

  function removeTicket(folderName: string): void {
    const order = read()
    if (!Object.values(order).some((folders) => folders.includes(folderName))) return
    write(Object.fromEntries(Object.entries(order).map(([column, folders]) => [column, folders.filter((folder) => folder !== folderName)])))
  }

  function renameTicket(oldFolderName: string, newFolderName: string): void {
    const order = read()
    if (!Object.values(order).some((folders) => folders.includes(oldFolderName))) return
    write(
      Object.fromEntries(
        Object.entries(order).map(([column, folders]) => {
          const renamedIndex = folders.indexOf(oldFolderName)
          return [column, folders.map((folder, index) => (index === renamedIndex ? newFolderName : folder))]
        }),
      ),
    )
  }

  return {
    read,
    write,
    reconcileAndSave,
    appendTicket,
    removeTicket,
    renameTicket,
  }
}
