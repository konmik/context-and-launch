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

// Hex form of the --background oklch tokens in src/app.css; parity is enforced by palette-backgrounds.test.ts.
export const PALETTE_BACKGROUNDS: Record<PaletteName, { light: string; dark: string }> = {
  "terminal": { light: "#ffffff", dark: "#000000" },
  "graphite": { light: "#ffffff", dark: "#000000" },
  "tokyo-night": { light: "#e1e2e7", dark: "#1a1b26" },
  "catppuccin": { light: "#eff1f5", dark: "#1e1e2e" },
  "dracula": { light: "#f8f8f2", dark: "#282a36" },
  "nord": { light: "#eceff4", dark: "#2e3440" },
  "gruvbox": { light: "#fbf1c8", dark: "#282828" },
};

export function paletteBackground(palette: PaletteName, dark: boolean): string {
  const entry = PALETTE_BACKGROUNDS[palette];
  return dark ? entry.dark : entry.light;
}

// Blocking critical CSS painted before the main stylesheet loads, so the first
// frame in a browser uses the correct palette background instead of UA white.
// color-scheme makes the browser's own canvas (the background shown around and
// before content paints, scrollbars, form controls) match the mode, which is
// what removes the white flash on a fresh open. The Electron shell achieves the
// same with BrowserWindow.setBackgroundColor. The mode is carried by the `dark`
// class, set by the inline theme script before first paint, so color-scheme
// depends only on that class, not the palette.
export function criticalBackgroundCss(): string {
  const def = PALETTE_BACKGROUNDS[DEFAULT_PALETTE];
  const rules = [
    `html{background:${def.light};color-scheme:light}`,
    `html.dark{background:${def.dark};color-scheme:dark}`,
  ];
  for (const palette of PALETTES) {
    const bg = PALETTE_BACKGROUNDS[palette];
    rules.push(`html[data-palette="${palette}"]{background:${bg.light}}`);
    rules.push(`html[data-palette="${palette}"].dark{background:${bg.dark}}`);
  }
  return rules.join("");
}
