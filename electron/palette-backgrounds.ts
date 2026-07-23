import { DEFAULT_PALETTE, isPaletteName, type PaletteName } from "../src/components/shared/palette-pure.js";

export { DEFAULT_PALETTE, isPaletteName, type PaletteName };

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
