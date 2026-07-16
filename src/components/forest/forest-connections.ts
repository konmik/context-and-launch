import { createSignal } from "solid-js";
import { verticalBezierPath } from "./forest-viewport.js";

export type ConnectionHandleEnd = "top" | "bottom";

export interface ConnectionEndpoint {
  ticketNumber: string;
  end: ConnectionHandleEnd;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ConnectionSurface {
  scopeGroupNumber?: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ConnectionAnchor {
  screenPoint: ScreenPoint;
  surface: ConnectionSurface;
}

export type ForestConnectionSession =
  | { kind: "idle" }
  | {
      kind: "connecting";
      source: ConnectionEndpoint;
      sourceScreenPoint: ScreenPoint;
      pointerScreenPoint: ScreenPoint;
      sourceSurface: ConnectionSurface;
      pointerSurface: ConnectionSurface;
    };

export interface ForestConnectionCommands {
  begin: (source: ConnectionEndpoint, anchor: ConnectionAnchor) => void;
  movePointer: (screenPoint: ScreenPoint, surface?: ConnectionSurface) => void;
  reanchorSource: (anchor: ConnectionAnchor) => void;
  cancel: () => void;
}

export function createForestConnection() {
  const [session, setSession] = createSignal<ForestConnectionSession>({ kind: "idle" });

  function begin(source: ConnectionEndpoint, anchor: ConnectionAnchor) {
    setSession({
      kind: "connecting",
      source,
      sourceScreenPoint: anchor.screenPoint,
      pointerScreenPoint: anchor.screenPoint,
      sourceSurface: anchor.surface,
      pointerSurface: anchor.surface,
    });
  }

  function movePointer(screenPoint: ScreenPoint, surface?: ConnectionSurface) {
    setSession(current => current.kind === "connecting"
      ? {
          ...current,
          pointerScreenPoint: screenPoint,
          pointerSurface: surface ?? current.pointerSurface,
        }
      : current);
  }

  function reanchorSource(anchor: ConnectionAnchor) {
    setSession(current => current.kind === "connecting"
      ? {
          ...current,
          sourceScreenPoint: anchor.screenPoint,
          sourceSurface: anchor.surface,
        }
      : current);
  }

  function cancel() {
    setSession({ kind: "idle" });
  }

  const commands: ForestConnectionCommands = { begin, movePointer, reanchorSource, cancel };
  return { session, commands };
}

export function isConnectionTarget(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
): boolean {
  return source.ticketNumber !== target.ticketNumber && source.end !== target.end;
}

export function dependencyFromEndpoints(
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
): { dependentNumber: string; dependencyNumber: string } {
  return source.end === "bottom"
    ? { dependentNumber: source.ticketNumber, dependencyNumber: target.ticketNumber }
    : { dependentNumber: target.ticketNumber, dependencyNumber: source.ticketNumber };
}

export function connectionPreviewPath(
  session: ForestConnectionSession,
  containerRect: { left: number; top: number },
): string | undefined {
  if (session.kind !== "connecting") return undefined;

  let visibleStart = session.sourceScreenPoint;
  let visibleEnd = session.pointerScreenPoint;
  if (session.sourceSurface.scopeGroupNumber !== session.pointerSurface.scopeGroupNumber) {
    if (session.pointerSurface.scopeGroupNumber) {
      const bounds = session.pointerSurface.bounds;
      visibleStart = {
        x: visibleEnd.x,
        y: session.source.end === "bottom" ? bounds.y : bounds.y + bounds.height,
      };
    } else if (session.sourceSurface.scopeGroupNumber) {
      const bounds = session.sourceSurface.bounds;
      visibleEnd = {
        x: visibleStart.x,
        y: session.source.end === "bottom" ? bounds.y + bounds.height : bounds.y,
      };
    }
  }

  const startX = visibleStart.x - containerRect.left;
  const startY = visibleStart.y - containerRect.top;
  const endX = visibleEnd.x - containerRect.left;
  const endY = visibleEnd.y - containerRect.top;
  return verticalBezierPath(
    { x: startX, y: startY },
    { x: endX, y: endY },
    session.source.end === "bottom" ? "down" : "up",
  );
}
