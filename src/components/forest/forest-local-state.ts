import type { ViewportAnchor } from "./forest-viewport.js";

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getViewMode(storage: Storage, projectSlug: string): "kanban" | "forest" {
  const stored = storage.getItem(`view-mode:${projectSlug}`);
  if (stored === null) return "kanban";
  if (stored === "kanban" || stored === "forest") return stored;
  throw new Error(`Invalid view mode for project ${projectSlug}`);
}

export function setViewMode(storage: Storage, projectSlug: string, mode: "kanban" | "forest"): void {
  storage.setItem(`view-mode:${projectSlug}`, mode);
}

export function getForestViewport(
  storage: Storage,
  projectSlug: string,
): ViewportAnchor | undefined {
  const raw = storage.getItem(`forest-viewport:${projectSlug}`);
  if (!raw) return undefined;
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === "object" && parsed !== null
    && "x" in parsed && typeof parsed.x === "number"
    && "y" in parsed && typeof parsed.y === "number"
    && "scale" in parsed && typeof parsed.scale === "number"
  ) {
    return { x: parsed.x, y: parsed.y, scale: parsed.scale };
  }
  throw new Error(`Invalid Forest viewport for project ${projectSlug}`);
}

export function setForestViewport(
  storage: Storage,
  projectSlug: string,
  anchor: ViewportAnchor,
): void {
  storage.setItem(`forest-viewport:${projectSlug}`, JSON.stringify(anchor));
}
