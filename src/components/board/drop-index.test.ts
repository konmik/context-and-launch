import { describe, it, expect } from "vitest";
import {
  computeDropIndex,
  computeHoverTarget,
  resolvePreviewInsertBefore,
} from "./drop-index.js";

describe("computeDropIndex", () => {
  function rects(tops: number[], h = 60) {
    return tops.map(top => ({ top, height: h }));
  }

  it("returns 0 above all cards", () => {
    expect(computeDropIndex(rects([100, 170, 240]), 50)).toBe(0);
  });

  it("returns length below all cards", () => {
    expect(computeDropIndex(rects([100, 170, 240]), 400)).toBe(3);
  });

  it("inserts before first card whose center is below cursor", () => {
    expect(computeDropIndex(rects([100, 170, 240]), 180)).toBe(1);
  });

  it("returns 0 for empty list", () => {
    expect(computeDropIndex([], 200)).toBe(0);
  });

  it("skips the drag source index", () => {
    expect(computeDropIndex(rects([100, 170, 240]), 180, 0)).toBe(0);
    expect(computeDropIndex(rects([100, 170, 240]), 300, 0)).toBe(2);
  });

  it("returns a post-removal index when dragging downward past the source", () => {
    expect(computeDropIndex(rects([100, 170, 240, 310]), 320, 1)).toBe(2);
  });
});

describe("computeHoverTarget", () => {
  const cols = new Map([
    ["todo", { left: 0, right: 200 }],
    ["done", { left: 220, right: 420 }],
  ]);
  const cards = new Map([
    ["todo", [{ top: 50, height: 60 }, { top: 120, height: 60 }]],
    ["done", [{ top: 50, height: 60 }]],
  ]);

  it("returns null outside all columns", () => {
    expect(computeHoverTarget(cols, cards, { x: 500, y: 100 })).toBeNull();
  });

  it("finds column and index", () => {
    expect(computeHoverTarget(cols, cards, { x: 100, y: 40 }))
      .toEqual({ column: "todo", index: 0 });
  });

  it("works cross-column", () => {
    expect(computeHoverTarget(cols, cards, { x: 300, y: 40 }))
      .toEqual({ column: "done", index: 0 });
  });

  it("skips drag source for same-column", () => {
    expect(computeHoverTarget(cols, cards, { x: 100, y: 100 }, { column: "todo", index: 0 }))
      .toEqual({ column: "todo", index: 0 });
  });

  it("does not skip when source is in different column", () => {
    expect(computeHoverTarget(cols, cards, { x: 100, y: 40 }, { column: "done", index: 0 }))
      .toEqual({ column: "todo", index: 0 });
  });
});

describe("resolvePreviewInsertBefore", () => {
  it("returns null with no hover target or a different column", () => {
    expect(resolvePreviewInsertBefore(null, "todo", null)).toBeNull();
    expect(resolvePreviewInsertBefore({ column: "done", index: 0 }, "todo", 1)).toBeNull();
  });

  it("maps directly for cross-column drops (no source in this column)", () => {
    expect(resolvePreviewInsertBefore({ column: "todo", index: 2 }, "todo", null)).toBe(2);
  });

  it("opens a slot at the top when dragging a lower ticket up", () => {
    expect(resolvePreviewInsertBefore({ column: "todo", index: 0 }, "todo", 1)).toBe(0);
  });

  it("shifts back to render space when dropping below the source", () => {
    expect(resolvePreviewInsertBefore({ column: "todo", index: 2 }, "todo", 0)).toBe(3);
  });

  it("shows no ghost for a no-op drop onto the source's own slot", () => {
    expect(resolvePreviewInsertBefore({ column: "todo", index: 1 }, "todo", 1)).toBeNull();
  });
});
