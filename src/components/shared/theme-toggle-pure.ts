export function getStoredTheme(
  storage: { getItem(key: string): string | null },
  matchesDark: boolean,
): "light" | "dark" {
  try {
    const stored = storage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* localStorage may throw in some environments */ }
  return matchesDark ? "dark" : "light";
}
