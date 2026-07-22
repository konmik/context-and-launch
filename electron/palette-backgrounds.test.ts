import { describe, it, expect } from "vitest";
import { PALETTES } from "../src/components/shared/palette-pure.js";
import { PALETTE_BACKGROUNDS, isPaletteName, paletteBackground } from "./palette-backgrounds.js";

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

  it("paletteBackground selects light or dark", () => {
    expect(paletteBackground("tokyo-night", true)).toBe("#1a1b26");
    expect(paletteBackground("tokyo-night", false)).toBe("#e1e2e7");
  });
});
