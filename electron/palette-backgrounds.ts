import { DEFAULT_PALETTE, isPaletteName, type PaletteName } from "../src/components/shared/palette-pure.js";

export { DEFAULT_PALETTE, isPaletteName, type PaletteName };

/**
 * Window background hex per palette and mode. These are the same source colors
 * the CSS `--background` token is derived from in src/app.css (converted to
 * oklch there). Keep the two in sync when adding or changing a palette.
 */
export const PALETTE_BACKGROUNDS: Record<PaletteName, { light: string; dark: string }> = {
  "terminal": { light: "#ffffff", dark: "#000000" },
  "graphite": { light: "#ffffff", dark: "#000000" },
  "tokyo-night": { light: "#e1e2e7", dark: "#1a1b26" },
  "catppuccin": { light: "#eff1f5", dark: "#1e1e2e" },
  "dracula": { light: "#f8f8f2", dark: "#282a36" },
  "nord": { light: "#eceff4", dark: "#2e3440" },
  "gruvbox": { light: "#fbf1c7", dark: "#282828" },
};

export function paletteBackground(palette: PaletteName, dark: boolean): string {
  const entry = PALETTE_BACKGROUNDS[palette];
  return dark ? entry.dark : entry.light;
}
