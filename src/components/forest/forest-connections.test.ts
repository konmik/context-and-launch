import { describe, expect, it } from "vitest";
import {
  connectionPreviewPath,
  dependencyFromEndpoints,
  isConnectionTarget,
  type ForestConnectionSession,
} from "./forest-connections.js";

describe("forest connections", () => {
  it("derives dependency direction from either handle orientation", () => {
    expect(dependencyFromEndpoints(
      { ticketNumber: "A-1", end: "bottom" },
      { ticketNumber: "B-1", end: "top" },
    )).toEqual({ dependentNumber: "A-1", dependencyNumber: "B-1" });
    expect(dependencyFromEndpoints(
      { ticketNumber: "A-1", end: "top" },
      { ticketNumber: "B-1", end: "bottom" },
    )).toEqual({ dependentNumber: "B-1", dependencyNumber: "A-1" });
  });

  it("accepts only an opposite handle on another ticket", () => {
    const source = { ticketNumber: "A-1", end: "bottom" } as const;
    expect(isConnectionTarget(source, { ticketNumber: "B-1", end: "top" })).toBe(true);
    expect(isConnectionTarget(source, { ticketNumber: "B-1", end: "bottom" })).toBe(false);
    expect(isConnectionTarget(source, { ticketNumber: "A-1", end: "top" })).toBe(false);
  });

  it("clips a cross-surface preview to the entered surface boundary", () => {
    const session: ForestConnectionSession = {
      kind: "connecting",
      source: { ticketNumber: "A-1", end: "bottom" },
      sourceScreenPoint: { x: 20, y: 30 },
      pointerScreenPoint: { x: 80, y: 90 },
      sourceSurface: {
        bounds: { x: 0, y: 0, width: 200, height: 200 },
      },
      pointerSurface: {
        scopeGroupNumber: "G-1",
        bounds: { x: 10, y: 40, width: 100, height: 120 },
      },
    };

    expect(connectionPreviewPath(
      session,
      { left: 5, top: 10 },
    )).toBe("M 75 30 C 75 55 75 55 75 80");
  });
});
