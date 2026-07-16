import { describe, expect, it } from "vitest";
import {
  externalDependencyPath,
  viewportAnchor,
  viewportForBounds,
  viewportFromAnchor,
} from "./forest-viewport.js";

describe("forest viewport", () => {
  it("round-trips a bottom-centered viewport anchor", () => {
    const viewport = { x: 125, y: 340, zoom: 1.5 };
    const anchor = viewportAnchor(viewport, 1000, 700);
    expect(viewportFromAnchor(anchor, 1000, 700)).toEqual(viewport);
  });

  it("places bounds at the horizontal center and bottom margin", () => {
    expect(viewportForBounds(
      { x: 100, y: 200, width: 300, height: 150 },
      1000,
      700,
    )).toEqual({ x: 250, y: 230, zoom: 1 });
  });

  it("terminates an external dependency at the supplied boundary", () => {
    expect(externalDependencyPath(
      { x: 50, y: 100 },
      "up",
      -20,
    )).toBe("M 50 100 C 50 40 50 40 50 -20");
  });
});
