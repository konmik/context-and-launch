import { describe, it, expect } from "vitest";
import {
  getStoredPalette, DEFAULT_PALETTE, PALETTES, PALETTE_BACKGROUNDS, criticalBackgroundCss,
} from "./palette-pure.js";

describe("getStoredPalette", () => {
  it("returns a stored valid palette", () => {
    const storage = { getItem: () => "dracula" };
    expect(getStoredPalette(storage)).toBe("dracula");
  });

  it("returns the default for an unknown stored value", () => {
    const storage = { getItem: () => "solarized" };
    expect(getStoredPalette(storage)).toBe(DEFAULT_PALETTE);
  });

  it("returns the default when storage throws", () => {
    const storage = { getItem: () => { throw new Error("denied"); } };
    expect(getStoredPalette(storage)).toBe(DEFAULT_PALETTE);
  });

  it("returns the default when nothing is stored", () => {
    const storage = { getItem: () => null };
    expect(getStoredPalette(storage)).toBe(DEFAULT_PALETTE);
  });
});

describe("criticalBackgroundCss", () => {
  const css = criticalBackgroundCss();

  it("paints the default palette background on bare html for both modes", () => {
    const def = PALETTE_BACKGROUNDS[DEFAULT_PALETTE];
    expect(css).toContain(`html{background:${def.light};color-scheme:light}`);
    expect(css).toContain(`html.dark{background:${def.dark};color-scheme:dark}`);
  });

  it("sets color-scheme so the browser canvas matches the mode on first paint", () => {
    expect(css).toContain("color-scheme:light");
    expect(css).toContain("color-scheme:dark");
  });

  it("paints every palette background in light and dark", () => {
    for (const palette of PALETTES) {
      const bg = PALETTE_BACKGROUNDS[palette];
      expect(css).toContain(`html[data-palette="${palette}"]{background:${bg.light}}`);
      expect(css).toContain(`html[data-palette="${palette}"].dark{background:${bg.dark}}`);
    }
  });

  it("orders each dark palette rule after its light rule so dark wins by source order", () => {
    for (const palette of PALETTES) {
      const bg = PALETTE_BACKGROUNDS[palette];
      const light = css.indexOf(`html[data-palette="${palette}"]{background:${bg.light}}`);
      const dark = css.indexOf(`html[data-palette="${palette}"].dark{background:${bg.dark}}`);
      expect(dark).toBeGreaterThan(light);
    }
  });
});
