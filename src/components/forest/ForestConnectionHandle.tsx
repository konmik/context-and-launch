import type { JSX } from '@solidjs/web'
import { useContext } from 'solid-js'
import { ForestCardCommandsContext, ForestConnectionSessionContext } from './forest-card-context.js'
import { isConnectionTarget, type ConnectionEndpoint } from './forest-connections.js'
import type { ForestNodeData } from './forest-flow-model.js'

export default function ForestConnectionHandle(props: { end: 'top' | 'bottom'; data: ForestNodeData; hovered: boolean }): JSX.Element {
  const commands = useContext(ForestCardCommandsContext)
  const connectionSession = useContext(ForestConnectionSessionContext)
  const endpoint = (): ConnectionEndpoint => ({
    ticketNumber: props.data.ticket.number,
    end: props.end,
  })
  const state = (): 'hidden' | 'visible' | 'source' | 'available' => {
    const session = connectionSession()
    if (session.kind !== 'connecting') return props.hovered ? 'visible' : 'hidden'
    if (props.data.representedTicketNumbers.includes(session.source.ticketNumber)) {
      return session.source.end === props.end ? 'source' : 'hidden'
    }
    return isConnectionTarget(session.source, endpoint()) ? 'available' : 'hidden'
  }
  return (
    <button
      type="button"
      class={`rounded-full border border-background bg-primary cursor-crosshair
        absolute left-1/2 -translate-x-1/2 ${props.end === 'top' ? '-top-1.5' : '-bottom-1.5'}
        transition-[opacity,transform,box-shadow] pointer-events-auto ${state() !== 'hidden' ? 'opacity-100' : 'opacity-0'}${state() === 'source' ? ' ring-4 ring-primary/30 scale-125' : ''}`}
      style={{
        width: '12px',
        height: '12px',
        'pointer-events': 'all',
      }}
      onClick={(event) => {
        event.stopPropagation()
        commands.activateConnection(endpoint())
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        commands.dragConnection(endpoint())
      }}
      data-testid={`forest-handle-${props.end}`}
      data-ticket-number={props.data.ticket.number}
      data-connection-handle-end={props.end}
      data-connection-handle-state={state()}
    />
  )
}
