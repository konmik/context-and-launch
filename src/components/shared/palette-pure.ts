export const PALETTES = ["terminal", "graphite", "tokyo-night", "catppuccin", "dracula", "nord", "gruvbox"] as const;
export type PaletteName = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: PaletteName = "terminal";

export function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value);
}

export function getStoredPalette(
  storage: { getItem(key: string): string | null },
): PaletteName {
  try {
    const stored = storage.getItem("palette");
    if (stored !== null && isPaletteName(stored)) return stored;
  } catch { /* localStorage may throw in some environments */ }
  return DEFAULT_PALETTE;
}
