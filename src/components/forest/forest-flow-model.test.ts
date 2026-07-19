import { describe, expect, it } from "vitest";
import { buildForestFlowModel, groupPosition, positionsFromNodes } from "./forest-flow-model.js";
import type { ForestTicket } from "./forest-graph.js";

const tickets: ForestTicket[] = [
  {
    number: "A-1",
    title: "Member",
    status: "todo",
    folderName: "a-1-member",
    memberOf: "G-1",
  },
  {
    number: "G-1",
    title: "Group",
    status: "todo",
    folderName: "g-1-group",
  },
  {
    number: "O-1",
    title: "Outside",
    status: "todo",
    folderName: "o-1-outside",
    dependsOn: ["A-1"],
  },
];

describe("forest flow model", () => {
  it("projects a collapsed group and preserves saved positions", () => {
    const model = buildForestFlowModel(tickets, undefined, {
      "G-1": { x: 25, y: 50 },
    });

    expect(model.nodes.map(node => node.id)).toEqual(["G-1", "O-1"]);
    expect(model.nodes[0]?.position).toEqual({ x: 25, y: 50 });
    expect(model.nodes[0]?.data.representedTicketNumbers).toEqual(["A-1", "G-1"]);
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({ source: "O-1", target: "G-1", selectable: false });
  });

  it("projects dependencies crossing a group boundary", () => {
    const model = buildForestFlowModel(tickets, "G-1", {});

    expect(model.nodes.map(node => node.id)).toEqual(["A-1"]);
    expect(model.edges).toEqual([]);
    expect(model.externalDependencies).toMatchObject([
      {
        memberNumber: "A-1",
        direction: "up",
      },
    ]);
  });

  it("dragging one ticket does not move the others", () => {
    const loose: ForestTicket[] = [
      { number: "L-1", title: "One", status: "todo", folderName: "l-1-one" },
      { number: "L-2", title: "Two", status: "todo", folderName: "l-2-two" },
      { number: "L-3", title: "Three", status: "todo", folderName: "l-3-three" },
    ];
    const canonical = positionsFromNodes(buildForestFlowModel(loose, undefined, {}).nodes);
    const afterDrag = positionsFromNodes(
      buildForestFlowModel(loose, undefined, { "L-1": { x: 999, y: 40 } }).nodes,
    );

    expect(afterDrag["L-1"]).toEqual({ x: 999, y: 40 });
    expect(afterDrag["L-2"]).toEqual(canonical["L-2"]);
    expect(afterDrag["L-3"]).toEqual(canonical["L-3"]);
  });

  it("converts node positions and centers a group card in selected bounds", () => {
    const model = buildForestFlowModel(tickets, "G-1", {
      "A-1": { x: 10, y: 20 },
    });

    expect(positionsFromNodes(model.nodes)).toEqual({
      "A-1": { x: 10, y: 20 },
    });
    expect(groupPosition({ x: 10, y: 20, width: 408, height: 172 }))
      .toEqual({ x: 110, y: 70 });
  });
});
