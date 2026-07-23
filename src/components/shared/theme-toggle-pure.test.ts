import { describe, it, expect } from "vitest";
import { getStoredTheme, getStoredMode, isDarkMode, parseMode } from "./theme-toggle-pure.js";
import { paletteBackground } from "./palette-pure.js";

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

describe("isDarkMode", () => {
  it("is dark when the app mode is dark, regardless of the OS", () => {
    expect(isDarkMode("dark", false)).toBe(true);
    expect(isDarkMode("dark", true)).toBe(true);
  });

  it("is light when the app mode is light, regardless of the OS", () => {
    expect(isDarkMode("light", true)).toBe(false);
    expect(isDarkMode("light", false)).toBe(false);
  });

  it("follows the OS when the app mode is system", () => {
    expect(isDarkMode("system", true)).toBe(true);
    expect(isDarkMode("system", false)).toBe(false);
  });

  it("paints the dark window background when dark is chosen on a light OS", () => {
    // The white-flash bug: native window background must match the chosen mode,
    // not the OS preference.
    expect(paletteBackground("terminal", isDarkMode("dark", false))).toBe("#000000");
    expect(paletteBackground("dracula", isDarkMode("dark", false))).toBe("#282a36");
  });
});

describe("getStoredMode", () => {
  it("returns the explicit stored mode", () => {
    expect(getStoredMode({ getItem: () => "dark" })).toBe("dark");
    expect(getStoredMode({ getItem: () => "light" })).toBe("light");
  });

  it("returns system when nothing is stored", () => {
    expect(getStoredMode({ getItem: () => null })).toBe("system");
  });

  it("returns system for an invalid stored value", () => {
    expect(getStoredMode({ getItem: () => "purple" })).toBe("system");
  });

  it("returns system when storage throws", () => {
    expect(getStoredMode({ getItem: () => { throw new Error("denied"); } })).toBe("system");
  });
});

describe("parseMode", () => {
  it("accepts the three valid modes", () => {
    expect(parseMode("light")).toBe("light");
    expect(parseMode("dark")).toBe("dark");
    expect(parseMode("system")).toBe("system");
  });

  it("returns undefined for anything else", () => {
    expect(parseMode("bright")).toBeUndefined();
    expect(parseMode(42)).toBeUndefined();
    expect(parseMode(undefined)).toBeUndefined();
  });
});
