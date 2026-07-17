import type { Viewport } from "@dschz/solid-flow";
import { CARD_HEIGHT, CARD_WIDTH } from "./forest-graph.js";
import type { ForestLayout } from "~/core/ticket/forest-layout-store.js";

export function viewportForLayout(
  positions: ForestLayout,
  width: number,
  height: number,
): Viewport {
  const values = Object.values(positions);
  if (values.length === 0) return { x: width / 2, y: height / 2, zoom: 1 };
  const minX = Math.min(...values.map(position => position.x));
  const minY = Math.min(...values.map(position => position.y));
  const maxX = Math.max(...values.map(position => position.x + CARD_WIDTH));
  const maxY = Math.max(...values.map(position => position.y + CARD_HEIGHT));
  return viewportForBounds(
    { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    width,
    height,
  );
}

export function viewportForBounds(
  bounds: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): Viewport {
  return {
    x: width / 2 - (bounds.x + bounds.width / 2),
    y: height - bounds.y - bounds.height - 120,
    zoom: 1,
  };
}

export interface MeasurableFlowNode {
  width?: number;
  height?: number;
  measured: { width?: number; height?: number };
  internals: { positionAbsolute: { x: number; y: number } };
}

export function nodeEndpointPoint(
  node: MeasurableFlowNode,
  end: "top" | "bottom",
): { x: number; y: number } {
  const width = node.measured.width ?? node.width ?? CARD_WIDTH;
  const height = node.measured.height ?? node.height ?? CARD_HEIGHT;
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: end === "bottom"
      ? node.internals.positionAbsolute.y + height
      : node.internals.positionAbsolute.y,
  };
}

export function verticalBezierPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  direction: "down" | "up",
): string {
  const offset = Math.min(120, Math.abs(end.y - start.y) * 0.5);
  const sign = direction === "down" ? 1 : -1;
  return [
    "M", start.x, start.y,
    "C", start.x, start.y + offset * sign,
    end.x, end.y - offset * sign,
    end.x, end.y,
  ].join(" ");
}

export function externalDependencyPath(
  start: { x: number; y: number },
  direction: "down" | "up",
  targetY: number,
): string {
  return verticalBezierPath(start, { x: start.x, y: targetY }, direction);
}
