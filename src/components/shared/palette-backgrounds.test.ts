import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  PALETTES, DEFAULT_PALETTE, PALETTE_BACKGROUNDS, isPaletteName, paletteBackground,
} from "./palette-pure.js";

const appCss = readFileSync(path.join(process.cwd(), "src", "app.css"), "utf8");

function cssBackgroundOklch(selector: string): [number, number, number] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = appCss.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  if (!block) throw new Error(`selector not found in app.css: ${selector}`);
  const value = block[1].match(/--background: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);/);
  if (!value) throw new Error(`--background oklch not found for ${selector}`);
  return [Number(value[1]), Number(value[2]), Number(value[3])];
}

function oklchToHex(lightness: number, chroma: number, hueDeg: number): string {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const channels = linear.map((v) => {
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    const clamped = Math.min(1, Math.max(0, encoded));
    return Math.round(clamped * 255).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

describe("palette backgrounds", () => {
  it("covers every palette with light and dark hex values", () => {
    for (const palette of PALETTES) {
      const entry = PALETTE_BACKGROUNDS[palette];
      expect(entry, `missing background for ${palette}`).toBeDefined();
      expect(entry.light).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.dark).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("defines no extra palettes beyond PALETTES", () => {
    expect(Object.keys(PALETTE_BACKGROUNDS).sort()).toEqual([...PALETTES].sort());
  });

  it("isPaletteName validates against the known list", () => {
    expect(isPaletteName("dracula")).toBe(true);
    expect(isPaletteName("solarized")).toBe(false);
    expect(isPaletteName(42)).toBe(false);
  });

  it("matches the --background oklch tokens in src/app.css", () => {
    for (const palette of PALETTES) {
      const lightSelector = palette === DEFAULT_PALETTE ? ":root" : `[data-palette="${palette}"]`;
      const darkSelector = palette === DEFAULT_PALETTE ? ".dark" : `[data-palette="${palette}"].dark`;
      expect(oklchToHex(...cssBackgroundOklch(lightSelector)), `${palette} light`)
        .toBe(PALETTE_BACKGROUNDS[palette].light);
      expect(oklchToHex(...cssBackgroundOklch(darkSelector)), `${palette} dark`)
        .toBe(PALETTE_BACKGROUNDS[palette].dark);
    }
  });

  it("paletteBackground selects light or dark", () => {
    expect(paletteBackground("tokyo-night", true)).toBe("#1a1b26");
    expect(paletteBackground("tokyo-night", false)).toBe("#e1e2e7");
  });
});
