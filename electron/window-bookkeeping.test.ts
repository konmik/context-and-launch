import { describe, it, expect } from "vitest";
import {
  migrateWindowState,
  restoreEntries,
  clampToDisplays,
  cascadeFrom,
  addSessionWindow,
  updateSessionWindow,
  closeSessionWindow,
  recordFocus,
  removeFromFocusOrder,
  mostRecentlyFocusedId,
  toWindowStateEntries,
  projectSlugFromUrl,
  CASCADE_STEP,
  type SessionWindow,
  type WindowStateEntry,
  type WindowBounds,
} from "./window-bookkeeping.js";

const display: WindowBounds = { x: 0, y: 0, width: 1920, height: 1080 };

describe("migrateWindowState", () => {
  it("null -> []", () => {
    expect(migrateWindowState(null)).toEqual([]);
  });

  it("garbage string -> []", () => {
    expect(migrateWindowState("nonsense")).toEqual([]);
  });

  it("legacy {width,height} -> one null-projectSlug entry", () => {
    expect(migrateWindowState({ width: 800, height: 600 })).toEqual([
      { projectSlug: null, bounds: { width: 800, height: 600 }, maximized: false },
    ]);
  });

  it("legacy with x/y/maximized preserved", () => {
    expect(migrateWindowState({ width: 800, height: 600, x: 10, y: 20, maximized: true })).toEqual([
      { projectSlug: null, bounds: { width: 800, height: 600, x: 10, y: 20 }, maximized: true },
    ]);
  });

  it("new list shape round-trips", () => {
    const entries: WindowStateEntry[] = [
      { projectSlug: "a", bounds: { x: 1, y: 2, width: 100, height: 200 }, maximized: false },
      { projectSlug: null, bounds: { width: 300, height: 400 }, maximized: true },
    ];
    expect(migrateWindowState({ windows: entries })).toEqual(entries);
  });

  it("malformed list elements dropped while valid ones survive", () => {
    const raw = {
      windows: [
        { projectSlug: "a", bounds: { width: 100, height: 200 }, maximized: false },
        { projectSlug: 5, bounds: { width: 100, height: 200 }, maximized: false },
        { projectSlug: "b", bounds: { width: "x", height: 200 }, maximized: false },
        { projectSlug: "c", bounds: { width: 100, height: 200 }, maximized: "no" },
        null,
        { projectSlug: "d", bounds: { x: 1, y: 2, width: 10, height: 20 }, maximized: true },
      ],
    };
    expect(migrateWindowState(raw)).toEqual([
      { projectSlug: "a", bounds: { width: 100, height: 200 }, maximized: false },
      { projectSlug: "d", bounds: { x: 1, y: 2, width: 10, height: 20 }, maximized: true },
    ]);
  });
});

describe("closeSessionWindow", () => {
  const list: SessionWindow[] = [
    { windowId: 1, projectSlug: "a", bounds: { width: 100, height: 100 }, maximized: false },
    { windowId: 2, projectSlug: "b", bounds: { width: 100, height: 100 }, maximized: false },
  ];

  it("removes among many", () => {
    const out = closeSessionWindow(list, 1, { width: 200, height: 200 }, false);
    expect(out).toEqual([
      { windowId: 2, projectSlug: "b", bounds: { width: 100, height: 100 }, maximized: false },
    ]);
  });

  it("keeps the last one with updated bounds and maximized", () => {
    const single: SessionWindow[] = [
      { windowId: 9, projectSlug: "a", bounds: { width: 100, height: 100 }, maximized: false },
    ];
    const out = closeSessionWindow(single, 9, { x: 5, y: 6, width: 200, height: 300 }, true);
    expect(out).toEqual([
      { windowId: 9, projectSlug: "a", bounds: { x: 5, y: 6, width: 200, height: 300 }, maximized: true },
    ]);
  });
});

describe("session list immutability", () => {
  it("addSessionWindow does not mutate input", () => {
    const list: SessionWindow[] = [];
    const w: SessionWindow = { windowId: 1, projectSlug: null, bounds: { width: 1, height: 1 }, maximized: false };
    const out = addSessionWindow(list, w);
    expect(list).toEqual([]);
    expect(out).toEqual([w]);
  });

  it("updateSessionWindow does not mutate input", () => {
    const list: SessionWindow[] = [
      { windowId: 1, projectSlug: "a", bounds: { width: 1, height: 1 }, maximized: false },
    ];
    const out = updateSessionWindow(list, 1, { projectSlug: "b" });
    expect(list[0].projectSlug).toBe("a");
    expect(out[0].projectSlug).toBe("b");
  });
});

describe("focus order", () => {
  it("recordFocus moves id to front and dedupes", () => {
    expect(recordFocus([2, 3], 1)).toEqual([1, 2, 3]);
    expect(recordFocus([1, 2, 3], 3)).toEqual([3, 1, 2]);
  });

  it("removeFromFocusOrder", () => {
    expect(removeFromFocusOrder([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("mostRecentlyFocusedId on empty -> null", () => {
    expect(mostRecentlyFocusedId([])).toBeNull();
    expect(mostRecentlyFocusedId([5, 6])).toBe(5);
  });
});

describe("cascadeFrom", () => {
  it("plain offset", () => {
    const out = cascadeFrom({ x: 100, y: 100, width: 800, height: 600 }, display);
    expect(out).toEqual({ x: 100 + CASCADE_STEP, y: 100 + CASCADE_STEP, width: 800, height: 600 });
  });

  it("wraps/clamps when opener is near the right/bottom edge", () => {
    const out = cascadeFrom({ x: 1150, y: 500, width: 800, height: 600 }, display);
    expect(out.x).toBe(1920 - 800);
    expect(out.y).toBe(1080 - 600);
    expect(out.width).toBe(800);
  });

  it("oversized opener clamped to work area", () => {
    const out = cascadeFrom({ x: 0, y: 0, width: 3000, height: 3000 }, display);
    expect(out.width).toBe(1920);
    expect(out.height).toBe(1080);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe("clampToDisplays", () => {
  it("fully on-screen unchanged", () => {
    const b: WindowBounds = { x: 100, y: 100, width: 400, height: 300 };
    expect(clampToDisplays(b, [display])).toEqual(b);
  });

  it("off-screen bounds moved into the best display", () => {
    const b: WindowBounds = { x: 5000, y: 5000, width: 400, height: 300 };
    const out = clampToDisplays(b, [display]);
    expect(out.x).toBe(1920 - 400);
    expect(out.y).toBe(1080 - 300);
  });

  it("larger-than-display shrunk", () => {
    const b: WindowBounds = { x: 0, y: 0, width: 4000, height: 4000 };
    const out = clampToDisplays(b, [display]);
    expect(out.width).toBe(1920);
    expect(out.height).toBe(1080);
  });

  it("missing x/y only clamps size", () => {
    const b: WindowBounds = { width: 4000, height: 4000 };
    const out = clampToDisplays(b, [display]);
    expect(out).toEqual({ width: 1920, height: 1080 });
    expect(out.x).toBeUndefined();
    expect(out.y).toBeUndefined();
  });

  it("picks the display with the largest intersection", () => {
    const second: WindowBounds = { x: 1920, y: 0, width: 1280, height: 1024 };
    const b: WindowBounds = { x: 1900, y: 0, width: 400, height: 300 };
    const out = clampToDisplays(b, [display, second]);
    expect(out.x).toBeGreaterThanOrEqual(1920);
  });
});

describe("restoreEntries", () => {
  const registered = new Set(["kept", "unavailable"]);
  const entries: WindowStateEntry[] = [
    { projectSlug: "kept", bounds: { x: 0, y: 0, width: 400, height: 300 }, maximized: false },
    { projectSlug: "gone", bounds: { x: 0, y: 0, width: 400, height: 300 }, maximized: false },
    { projectSlug: "unavailable", bounds: { x: 5000, y: 5000, width: 400, height: 300 }, maximized: false },
    { projectSlug: null, bounds: { x: 0, y: 0, width: 400, height: 300 }, maximized: false },
  ];

  it("drops gone projects, keeps null and registered-but-unavailable, clamps bounds", () => {
    const out = restoreEntries(entries, registered, [display]);
    expect(out.map((e) => e.projectSlug)).toEqual(["kept", "unavailable", null]);
    const unavailable = out.find((e) => e.projectSlug === "unavailable")!;
    expect(unavailable.bounds.x).toBe(1920 - 400);
    expect(unavailable.bounds.y).toBe(1080 - 300);
  });
});

describe("toWindowStateEntries", () => {
  it("strips windowId", () => {
    const list: SessionWindow[] = [
      { windowId: 7, projectSlug: "a", bounds: { width: 1, height: 1 }, maximized: false },
    ];
    expect(toWindowStateEntries(list)).toEqual([
      { projectSlug: "a", bounds: { width: 1, height: 1 }, maximized: false },
    ]);
  });
});

describe("projectSlugFromUrl", () => {
  it("parses a project url", () => {
    expect(projectSlugFromUrl("http://127.0.0.1:1234/project/my-proj")).toBe("my-proj");
  });

  it("root and /add-project -> null", () => {
    expect(projectSlugFromUrl("http://127.0.0.1:1234/")).toBeNull();
    expect(projectSlugFromUrl("http://127.0.0.1:1234/add-project")).toBeNull();
  });

  it("encoded projectSlug decoded", () => {
    expect(projectSlugFromUrl("http://127.0.0.1:1234/project/a%20b")).toBe("a b");
  });

  it("/project/a/b -> null", () => {
    expect(projectSlugFromUrl("http://127.0.0.1:1234/project/a/b")).toBeNull();
  });

  it("unparseable -> null", () => {
    expect(projectSlugFromUrl("not a url")).toBeNull();
  });
});
