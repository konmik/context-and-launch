import { describe, it, expect } from "vitest";
import { getStoredTheme } from "./theme-toggle-pure.js";

describe("getStoredTheme", () => {
  it("returns stored dark", () => {
    const storage = { getItem: () => "dark" };
    expect(getStoredTheme(storage, false)).toBe("dark");
  });

  it("returns stored light", () => {
    const storage = { getItem: () => "light" };
    expect(getStoredTheme(storage, true)).toBe("light");
  });

  it("falls back to system preference dark when no stored value", () => {
    const storage = { getItem: () => null };
    expect(getStoredTheme(storage, true)).toBe("dark");
  });

  it("falls back to system preference light when no stored value", () => {
    const storage = { getItem: () => null };
    expect(getStoredTheme(storage, false)).toBe("light");
  });

  it("falls back to system preference when storage throws", () => {
    const storage = { getItem: () => { throw new Error("denied"); } };
    expect(getStoredTheme(storage, true)).toBe("dark");
  });

  it("falls back to system preference for invalid stored value", () => {
    const storage = { getItem: () => "invalid" };
    expect(getStoredTheme(storage, false)).toBe("light");
  });
});
