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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseBounds(raw: unknown): WindowBounds | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.width) || !isFiniteNumber(r.height)) return null;
  const bounds: WindowBounds = { width: r.width, height: r.height };
  if (r.x !== undefined) {
    if (!isFiniteNumber(r.x)) return null;
    bounds.x = r.x;
  }
  if (r.y !== undefined) {
    if (!isFiniteNumber(r.y)) return null;
    bounds.y = r.y;
  }
  return bounds;
}

function parseEntry(raw: unknown): WindowStateEntry | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.projectSlug !== null && typeof r.projectSlug !== "string") return null;
  const bounds = parseBounds(r.bounds);
  if (!bounds) return null;
  if (typeof r.maximized !== "boolean") return null;
  return { projectSlug: r.projectSlug, bounds, maximized: r.maximized };
}

export function migrateWindowState(raw: unknown): WindowStateEntry[] {
  if (raw === null || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.windows)) {
    const entries: WindowStateEntry[] = [];
    for (const element of r.windows) {
      const entry = parseEntry(element);
      if (entry) entries.push(entry);
    }
    return entries;
  }
  const bounds = parseBounds(r);
  if (bounds) {
    return [{ projectSlug: null, bounds, maximized: !!r.maximized }];
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
