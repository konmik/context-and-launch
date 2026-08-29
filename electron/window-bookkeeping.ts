import * as v from "valibot";
import type { JsonValue } from "../src/core/shared/json.js";

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface WindowStateEntry {
  projectSlug: string | null;
  bounds: WindowBounds;
  maximized: boolean;
}

export interface SessionWindow {
  windowId: number;
  projectSlug: string | null;
  bounds: WindowBounds;
  maximized: boolean;
}

export const DEFAULT_WINDOW_WIDTH = 1400;
export const DEFAULT_WINDOW_HEIGHT = 900;
export const CASCADE_STEP = 32;

const FiniteNumberSchema = v.pipe(v.number(), v.finite());
const WindowBoundsSchema = v.object({
  x: v.optional(FiniteNumberSchema),
  y: v.optional(FiniteNumberSchema),
  width: FiniteNumberSchema,
  height: FiniteNumberSchema,
});
const WindowStateEntrySchema = v.object({
  projectSlug: v.nullable(v.string()),
  bounds: WindowBoundsSchema,
  maximized: v.boolean(),
});
const WindowStateRecordSchema = v.record(v.string(), v.unknown());

function parseEntry(raw: JsonValue): WindowStateEntry | null {
  const parsed = v.safeParse(WindowStateEntrySchema, raw);
  return parsed.success ? parsed.output : null;
}

export function migrateWindowState(raw: JsonValue): WindowStateEntry[] {
  if (Array.isArray(raw)) return [];
  const parsed = v.safeParse(WindowStateRecordSchema, raw);
  if (!parsed.success) return [];
  const r = parsed.output;
  if (Array.isArray(r.windows)) {
    const entries: WindowStateEntry[] = [];
    for (const element of r.windows) {
      const entry = parseEntry(element);
      if (entry) entries.push(entry);
    }
    return entries;
  }
  const parsedBounds = v.safeParse(WindowBoundsSchema, r);
  if (parsedBounds.success) {
    return [{ projectSlug: null, bounds: parsedBounds.output, maximized: !!r.maximized }];
  }
  return [];
}

function intersectionArea(a: WindowBounds, b: WindowBounds): number {
  const ax = a.x ?? 0;
  const ay = a.y ?? 0;
  const bx = b.x ?? 0;
  const by = b.y ?? 0;
  const left = Math.max(ax, bx);
  const top = Math.max(ay, by);
  const right = Math.min(ax + a.width, bx + b.width);
  const bottom = Math.min(ay + a.height, by + b.height);
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

export function clampToDisplays(
  bounds: WindowBounds,
  displayWorkAreas: WindowBounds[],
): WindowBounds {
  if (bounds.x === undefined || bounds.y === undefined) {
    let largest = displayWorkAreas[0];
    for (const wa of displayWorkAreas) {
      if (wa.width * wa.height > largest.width * largest.height) largest = wa;
    }
    const result: WindowBounds = {
      width: Math.min(bounds.width, largest.width),
      height: Math.min(bounds.height, largest.height),
    };
    if (bounds.x !== undefined) result.x = bounds.x;
    if (bounds.y !== undefined) result.y = bounds.y;
    return result;
  }

  let best = displayWorkAreas[0];
  let bestArea = -1;
  for (const wa of displayWorkAreas) {
    const area = intersectionArea(bounds, wa);
    if (area > bestArea) {
      bestArea = area;
      best = wa;
    }
  }

  const width = Math.min(bounds.width, best.width);
  const height = Math.min(bounds.height, best.height);
  const waX = best.x ?? 0;
  const waY = best.y ?? 0;
  const maxX = waX + best.width - width;
  const maxY = waY + best.height - height;
  const x = Math.min(Math.max(bounds.x, waX), maxX);
  const y = Math.min(Math.max(bounds.y, waY), maxY);
  return { x, y, width, height };
}

export function cascadeFrom(
  openerBounds: Required<WindowBounds>,
  workArea: WindowBounds,
): WindowBounds {
  return clampToDisplays(
    {
      x: openerBounds.x + CASCADE_STEP,
      y: openerBounds.y + CASCADE_STEP,
      width: openerBounds.width,
      height: openerBounds.height,
    },
    [workArea],
  );
}

export function addSessionWindow(list: SessionWindow[], w: SessionWindow): SessionWindow[] {
  return [...list, w];
}

export function updateSessionWindow(
  list: SessionWindow[],
  windowId: number,
  patch: Partial<Omit<SessionWindow, "windowId">>,
): SessionWindow[] {
  return list.map((w) => (w.windowId === windowId ? { ...w, ...patch } : w));
}

export function closeSessionWindow(
  list: SessionWindow[],
  windowId: number,
  finalBounds: WindowBounds,
  maximized: boolean,
): SessionWindow[] {
  if (list.length <= 1) {
    return list.map((w) =>
      w.windowId === windowId ? { ...w, bounds: finalBounds, maximized } : w,
    );
  }
  return list.filter((w) => w.windowId !== windowId);
}

export function recordFocus(order: number[], windowId: number): number[] {
  return [windowId, ...order.filter((id) => id !== windowId)];
}

export function removeFromFocusOrder(order: number[], windowId: number): number[] {
  return order.filter((id) => id !== windowId);
}

export function mostRecentlyFocusedId(order: number[]): number | null {
  return order.length > 0 ? order[0] : null;
}

export function toWindowStateEntries(list: SessionWindow[]): WindowStateEntry[] {
  return list.map((w) => ({
    projectSlug: w.projectSlug,
    bounds: w.bounds,
    maximized: w.maximized,
  }));
}

export function restoreEntries(
  entries: WindowStateEntry[],
  registeredProjectSlugs: ReadonlySet<string>,
  displayWorkAreas: WindowBounds[],
): WindowStateEntry[] {
  return entries
    .filter((e) => e.projectSlug === null || registeredProjectSlugs.has(e.projectSlug))
    .map((e) => ({ ...e, bounds: clampToDisplays(e.bounds, displayWorkAreas) }));
}

export function projectSlugFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = /^\/project\/([^/]+)$/.exec(parsed.pathname);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}
