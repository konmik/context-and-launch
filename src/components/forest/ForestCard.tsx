import { createContext, createSignal, Show, useContext } from "solid-js";
import { Group } from "~/components/ui/icons.js";
import { EllipsisVertical } from "~/components/ui/icons.js";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/menu";
import {
  isConnectionTarget,
  type ConnectionEndpoint,
  type ForestConnectionSession,
} from "./forest-connections.js";
import { CARD_WIDTH } from "./forest-graph.js";
import type { ForestNodeData } from "./forest-flow-model.js";
import type { SwatchColumn } from "~/core/board/status-swatch.js";
import StatusSwatch from "../ticket/StatusSwatch";
import HerdrStatusIcon from "../ticket/HerdrStatusIcon";
import { useHerdrStatuses } from "../ticket/herdr-statuses-context.js";

export interface ForestCardCommands {
  activateConnection: (endpoint: ConnectionEndpoint) => void;
  dragConnection: (endpoint: ConnectionEndpoint) => void;
  openGroupTicket: (ticketNumber: string) => void;
  ungroup: (ticketNumber: string) => void;
}

export const ForestCardCommandsContext = createContext<ForestCardCommands>();
export const ForestConnectionSessionContext = createContext<() => ForestConnectionSession>();
export const ForestCardColumnsContext = createContext<() => SwatchColumn[]>();

export default function ForestCard(
  props: { data: ForestNodeData; selected?: boolean },
) {
  const commands = useContext(ForestCardCommandsContext);
  const connectionSession = useContext(ForestConnectionSessionContext);
  const columns = useContext(ForestCardColumnsContext);
  const herdrStatus = useHerdrStatuses();
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
      <button
        type="button"
        class={`rounded-full border border-background bg-primary cursor-crosshair
          absolute left-1/2 -translate-x-1/2 ${handleProps.end === "top" ? "-top-1.5" : "-bottom-1.5"}
          transition-[opacity,transform,box-shadow] pointer-events-auto ${visible()
            ? "opacity-100"
            : "opacity-0"}${state() === "source"
            ? " ring-4 ring-primary/30 scale-125"
            : ""}`}
        style={{
          width: "12px",
          height: "12px",
          "z-index": 1,
          "pointer-events": "all",
        }}
        onClick={(event) => {
          event.stopPropagation();
          commands.activateConnection(endpoint());
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          commands.dragConnection(endpoint());
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
        class={`forest-card-surface min-h-[72px] rounded-md bg-card/75 backdrop-blur-[2px] ${
          props.data.group ? "border-2 border-dashed" : "border"
        }${props.selected ? " ring-2 ring-primary" : ""}`}
      >
        <div class="flex items-start gap-1 p-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <Show when={props.data.group}>
                <Group size={12} class="shrink-0 text-muted-foreground" />
              </Show>
              <span class="truncate text-sm font-medium text-primary">{ticketNumber()}</span>
              <StatusSwatch status={props.data.ticket.status} columns={columns()} />
              <Show when={herdrStatus(props.data.ticket.folderName)}>
                {(s) => <HerdrStatusIcon status={s()} />}
              </Show>
            </div>
            <p class="line-clamp-2 text-sm">{props.data.ticket.title}</p>
          </div>
          <Show when={props.data.group}>
            <div
              class="contents nodrag nopan"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event: MouseEvent) => event.stopPropagation()}
            >
              <MenuRoot
                trigger={
                  <MenuTrigger
                    class="btn-icon h-6 w-6 shrink-0"
                    data-testid="forest-group-menu-trigger"
                  >
                    <EllipsisVertical size={14} />
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
