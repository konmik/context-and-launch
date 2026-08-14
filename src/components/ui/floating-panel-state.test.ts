import { describe, expect, it } from "vitest";
import { constrainFloatingPanelRect, resizeFloatingPanelRect } from "./floating-panel-state.js";

describe("floating panel geometry", () => {
  it("keeps the complete panel inside its viewport", () => {
    expect(constrainFloatingPanelRect(
      { position: { x: 900, y: 700 }, size: { width: 400, height: 300 } },
      { width: 1200, height: 800 },
      { width: 200, height: 150 },
    )).toEqual({ position: { x: 800, y: 500 }, size: { width: 400, height: 300 } });
  });

  it("fits minimum-sized panels into smaller viewports", () => {
    expect(constrainFloatingPanelRect(
      { position: { x: 10, y: 20 }, size: { width: 600, height: 500 } },
      { width: 320, height: 240 },
      { width: 400, height: 300 },
    )).toEqual({ position: { x: 0, y: 0 }, size: { width: 320, height: 240 } });
  });

  it("clamps southeast resizing without moving the opposite corner", () => {
    expect(resizeFloatingPanelRect(
      { position: { x: 300, y: 200 }, size: { width: 400, height: 300 } },
      { width: 1_000, height: 1_000 },
      { width: 800, height: 600 },
      { width: 200, height: 150 },
    )).toEqual({ position: { x: 300, y: 200 }, size: { width: 500, height: 400 } });
  });
});
