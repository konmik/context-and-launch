import {
  BaseEdge,
  getBezierPath,
  Position,
  useInternalNode,
  type EdgeProps,
} from "@dschz/solid-flow";
import type { ForestEdgeData } from "./forest-flow-model.js";
import { nodeEndpointPoint } from "./forest-viewport.js";

export default function ForestDependencyEdge(
  props: EdgeProps<ForestEdgeData, "forest-dependency">,
) {
  const sourceNode = useInternalNode(() => props.source);
  const targetNode = useInternalNode(() => props.target);
  const path = () => {
    const source = sourceNode();
    const target = targetNode();
    const sourcePoint = source
      ? nodeEndpointPoint(source, "bottom")
      : { x: props.sourceX, y: props.sourceY };
    const targetPoint = target
      ? nodeEndpointPoint(target, "top")
      : { x: props.targetX, y: props.targetY };
    return getBezierPath({
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      sourcePosition: Position.Bottom,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
      targetPosition: Position.Top,
    })[0];
  };

  return (
    <BaseEdge
      path={path()}
      class="stroke-muted-foreground"
      stroke-width="2"
      interactionWidth={32}
      data-testid="forest-dependency"
      data-from={props.source}
      data-to={props.target}
    />
  );
}
