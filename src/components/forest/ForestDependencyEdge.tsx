/* eslint-disable max-len */
import type { DependencyRelation } from "./forest-graph.js";
import { verticalBezierPath } from "./forest-viewport.js";

export default function ForestDependencyEdge(props: {
  source: string;
  target: string;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  relations: DependencyRelation[];
  onClick: (event: MouseEvent) => void;
}) {
  const path = () => verticalBezierPath(props.sourcePoint, props.targetPoint, "down");
  return <>
    <path d={path()} fill="none" class="stroke-muted-foreground" stroke-width="2" pointer-events="none" data-testid="forest-dependency" data-from={props.source} data-to={props.target} />
    <path d={path()} fill="none" stroke="transparent" stroke-width="32" style={{ "pointer-events": "stroke", cursor: "pointer" }} onPointerDown={(event) => event.stopPropagation()} onClick={props.onClick} data-testid="forest-dependency-hit" data-from={props.source} data-to={props.target} />
  </>;
}
