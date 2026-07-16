import { Handle, Position, type NodeProps } from "@dschz/solid-flow";
import { createContext, createSignal, Show, useContext } from "solid-js";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/menu";
import {
  isConnectionTarget,
  type ConnectionEndpoint,
  type ForestConnectionSession,
} from "./forest-connections.js";
import { CARD_WIDTH } from "./forest-graph.js";
import type { ForestNodeData } from "./forest-flow-model.js";

export interface ForestCardCommands {
  activateConnection: (endpoint: ConnectionEndpoint) => void;
  openGroupTicket: (ticketNumber: string) => void;
  ungroup: (ticketNumber: string) => void;
}

export const ForestCardCommandsContext = createContext<ForestCardCommands>();
export const ForestConnectionSessionContext = createContext<() => ForestConnectionSession>();

function requireCardCommands(): ForestCardCommands {
  const commands = useContext(ForestCardCommandsContext);
  if (!commands) throw new Error("Forest card commands are unavailable");
  return commands;
}

function requireConnectionSession(): () => ForestConnectionSession {
  const session = useContext(ForestConnectionSessionContext);
  if (!session) throw new Error("Forest connection session is unavailable");
  return session;
}

export default function ForestCard(
  props: NodeProps<ForestNodeData, "forest-ticket">,
) {
  const commands = requireCardCommands();
  const connectionSession = requireConnectionSession();
  const [hovered, setHovered] = createSignal(false);
  const ticketNumber = () => props.data.ticket.number;

  function handleState(endpoint: ConnectionEndpoint): "hidden" | "visible" | "source" | "available" {
    const session = connectionSession();
    if (session.kind !== "connecting") return hovered() ? "visible" : "hidden";
    if (props.data.representedTicketNumbers.includes(session.source.ticketNumber)) {
      return session.source.end === endpoint.end ? "source" : "hidden";
    }
    return isConnectionTarget(session.source, endpoint) ? "available" : "hidden";
  }

  function ConnectionHandle(handleProps: { end: "top" | "bottom" }) {
    const endpoint = (): ConnectionEndpoint => ({ ticketNumber: ticketNumber(), end: handleProps.end });
    const state = () => handleState(endpoint());
    const visible = () => state() !== "hidden";
    return (
      <Handle
        id={handleProps.end}
        type={handleProps.end === "top" ? "target" : "source"}
        position={handleProps.end === "top" ? Position.Top : Position.Bottom}
        isConnectable
        isConnectableStart={connectionSession().kind === "idle"}
        isConnectableEnd={connectionSession().kind === "idle" || state() === "available"}
        class={`rounded-full border border-background bg-primary cursor-crosshair
          transition-[opacity,transform,box-shadow] ${visible()
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"}${state() === "source"
            ? " ring-4 ring-primary/30 scale-125"
            : ""}`}
        style={{
          width: "12px",
          height: "12px",
          "pointer-events": visible() ? "all" : "none",
        }}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          commands.activateConnection(endpoint());
        }}
        data-testid={`forest-handle-${handleProps.end}`}
        data-ticket-number={ticketNumber()}
        data-connection-handle-end={handleProps.end}
        data-connection-handle-state={state()}
      />
    );
  }

  return (
    <div
      class="relative min-h-[72px] select-none"
      style={{ width: `${CARD_WIDTH}px` }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      data-testid={props.data.group ? "forest-group-card" : "forest-ticket-card"}
      data-forest-card
      data-ticket-number={ticketNumber()}
    >
      <div
        class={`min-h-[72px] rounded-md bg-card/75 shadow-sm backdrop-blur-[2px] ${
          props.data.group ? "border-2 border-dashed border-border" : "border border-border"
        }${props.selected ? " ring-2 ring-primary" : ""}`}
      >
        <div class="flex items-start gap-1 p-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <Show when={props.data.group}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground"
                >
                  <rect x="2" y="4" width="14" height="12" rx="2"/>
                  <rect x="8" y="8" width="14" height="12" rx="2"/>
                </svg>
              </Show>
              <span class="truncate text-sm font-medium text-primary">{ticketNumber()}</span>
            </div>
            <p class="line-clamp-2 text-sm">{props.data.ticket.title}</p>
          </div>
          <Show when={props.data.group}>
            <div
              class="contents nodrag nopan"
              on:pointerdown={(event: PointerEvent) => event.stopPropagation()}
              onClick={(event: MouseEvent) => event.stopPropagation()}
            >
              <MenuRoot
                trigger={
                  <MenuTrigger
                    class="btn-icon h-6 w-6 shrink-0"
                    data-testid="forest-group-menu-trigger"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                    </svg>
                  </MenuTrigger>
                }
              >
                <MenuContent>
                  <MenuItem
                    value="ungroup"
                    onClick={() => commands.ungroup(ticketNumber())}
                    data-testid="forest-group-menu-ungroup"
                  >Ungroup</MenuItem>
                  <MenuItem
                    value="open-ticket"
                    onClick={() => commands.openGroupTicket(ticketNumber())}
                    data-testid="forest-group-menu-open-ticket"
                  >Open group ticket</MenuItem>
                </MenuContent>
              </MenuRoot>
            </div>
          </Show>
        </div>
      </div>
      <ConnectionHandle end="top" />
      <ConnectionHandle end="bottom" />
    </div>
  );
}
