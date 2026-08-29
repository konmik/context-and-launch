import * as v from "valibot";
import type { ForestViewport } from "./forest-types.js";

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const ForestViewportSchema = v.object({
  x: v.number(),
  y: v.number(),
  zoom: v.number(),
});

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
): ForestViewport | undefined {
  const raw = storage.getItem(`forest-viewport:${projectSlug}`);
  if (!raw) return undefined;
  const parsed = v.safeParse(ForestViewportSchema, JSON.parse(raw));
  return parsed.success ? parsed.output : undefined;
}

export function setForestViewport(
  storage: Storage,
  projectSlug: string,
  viewport: ForestViewport,
): void {
  storage.setItem(`forest-viewport:${projectSlug}`, JSON.stringify(viewport));
}
