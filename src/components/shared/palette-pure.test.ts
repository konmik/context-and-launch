import { describe, it, expect } from "vitest";
import { getStoredPalette, DEFAULT_PALETTE } from "./palette-pure.js";

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
