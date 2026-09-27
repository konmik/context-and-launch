import { createContext } from 'solid-js'
import type { ConnectionEndpoint, ForestConnectionSession } from './forest-connections.js'
import type { SwatchColumn } from '~/core/board/status-swatch.js'

export interface ForestCardCommands {
  activateConnection: (endpoint: ConnectionEndpoint) => void
  dragConnection: (endpoint: ConnectionEndpoint) => void
  openGroupTicket: (ticketNumber: string) => void
  ungroup: (ticketNumber: string) => void
}

export const ForestCardCommandsContext = createContext<ForestCardCommands>()
export const ForestConnectionSessionContext = createContext<() => ForestConnectionSession>()
export const ForestCardColumnsContext = createContext<() => SwatchColumn[]>()
