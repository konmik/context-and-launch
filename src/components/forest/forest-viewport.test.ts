import { describe, expect, it } from "vitest";
import {
  externalDependencyPath,
  viewportForBounds,
} from "./forest-viewport.js";

describe("forest viewport", () => {
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
