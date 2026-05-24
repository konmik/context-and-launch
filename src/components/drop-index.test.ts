import { describe, it, expect } from "vitest";
import { computeDropIndex, computeHoverTarget } from "./drop-index.js";

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
    expect(computeDropIndex(rects([100, 170, 240]), 180, 0)).toBe(1);
    expect(computeDropIndex(rects([100, 170, 240]), 300, 0)).toBe(2);
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
      .toEqual({ column: "todo", index: 1 });
  });

  it("does not skip when source is in different column", () => {
    expect(computeHoverTarget(cols, cards, { x: 100, y: 40 }, { column: "done", index: 0 }))
      .toEqual({ column: "todo", index: 0 });
  });
});
