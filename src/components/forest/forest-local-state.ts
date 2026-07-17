import type { Viewport } from "@dschz/solid-flow";

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
): Viewport | undefined {
  const raw = storage.getItem(`forest-viewport:${projectSlug}`);
  if (!raw) return undefined;
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === "object" && parsed !== null
    && "x" in parsed && typeof parsed.x === "number"
    && "y" in parsed && typeof parsed.y === "number"
    && "zoom" in parsed && typeof parsed.zoom === "number"
  ) {
    return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
  }
  throw new Error(`Invalid Forest viewport for project ${projectSlug}`);
}

export function setForestViewport(
  storage: Storage,
  projectSlug: string,
  viewport: Viewport,
): void {
  storage.setItem(`forest-viewport:${projectSlug}`, JSON.stringify(viewport));
}
