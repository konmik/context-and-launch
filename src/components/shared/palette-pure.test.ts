import { describe, it, expect } from "vitest";
import {
  getStoredPalette, DEFAULT_PALETTE, PALETTES, PALETTE_BACKGROUNDS,
  criticalBackgroundCss, criticalAppearanceScript,
} from "./palette-pure.js";
import { getStoredMode, isDarkMode } from "./theme-toggle-pure.js";

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

describe("criticalAppearanceScript", () => {
  function runScript(getItem: (key: string) => string | null, prefersDark: boolean) {
    const classes = new Set<string>();
    const dataset: Record<string, string | undefined> = {};
    const fakeDocument = {
      documentElement: {
        classList: { add: (name: string) => classes.add(name) },
        dataset,
      },
    };
    new Function("localStorage", "matchMedia", "document", criticalAppearanceScript())(
      { getItem },
      () => ({ matches: prefersDark }),
      fakeDocument,
    );
    return { dark: classes.has("dark"), palette: dataset.palette };
  }

  it("applies the dark class exactly when isDarkMode(getStoredMode(...)) says dark", () => {
    for (const stored of [null, "dark", "light", "system", "purple"]) {
      for (const prefersDark of [false, true]) {
        const storage = { getItem: () => stored };
        const expected = isDarkMode(getStoredMode(storage), prefersDark);
        const result = runScript((key) => (key === "theme" ? stored : null), prefersDark);
        expect(result.dark, `stored=${stored} prefersDark=${prefersDark}`).toBe(expected);
      }
    }
  });

  it("applies every valid stored palette to data-palette", () => {
    for (const palette of PALETTES) {
      expect(runScript((key) => (key === "palette" ? palette : null), false).palette).toBe(palette);
    }
  });

  it("leaves data-palette unset for a missing or invalid palette so the default CSS rule applies", () => {
    expect(runScript(() => null, false).palette).toBeUndefined();
    expect(runScript((key) => (key === "palette" ? "solarized" : null), false).palette).toBeUndefined();
  });

  it("does nothing when storage throws", () => {
    const result = runScript(() => { throw new Error("denied"); }, true);
    expect(result.dark).toBe(false);
    expect(result.palette).toBeUndefined();
  });
});
