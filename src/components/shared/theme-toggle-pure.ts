export type AppMode = "light" | "dark" | "system";

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

export function parseMode(value: unknown): AppMode | undefined {
  return value === "light" || value === "dark" || value === "system" ? value : undefined;
}

// The persisted appearance mode: an explicit user override, or "system" to
// follow the OS. Absence of a stored value means the user never toggled, so the
// mode follows the OS.
export function getStoredMode(
  storage: { getItem(key: string): string | null },
): AppMode {
  try {
    return parseMode(storage.getItem("theme")) ?? "system";
  } catch { /* localStorage may throw in some environments */ }
  return "system";
}

export function isDarkMode(mode: AppMode, systemPrefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemPrefersDark;
}
