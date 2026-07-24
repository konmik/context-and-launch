export type AppMode = "light" | "dark" | "system";

export function parseMode(value: unknown): AppMode | undefined {
  return value === "light" || value === "dark" || value === "system" ? value : undefined;
}

export function modeStorageKey(projectSlug?: string): string {
  return projectSlug === undefined ? "theme" : `theme:${projectSlug}`;
}

// The persisted appearance mode: an explicit user override, or "system" to
// follow the OS. Absence of a stored value means the user never toggled, so the
// mode follows the OS.
export function getStoredMode(
  storage: { getItem(key: string): string | null },
  projectSlug?: string,
): AppMode {
  try {
    const scoped = projectSlug === undefined
      ? null
      : storage.getItem(modeStorageKey(projectSlug));
    return parseMode(scoped ?? storage.getItem(modeStorageKey())) ?? "system";
  } catch { /* localStorage may throw in some environments */ }
  return "system";
}

export function setStoredMode(
  storage: { setItem(key: string, value: string): void },
  projectSlug: string | undefined,
  mode: AppMode,
): void {
  storage.setItem(modeStorageKey(projectSlug), mode);
}

export function isDarkMode(mode: AppMode, systemPrefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemPrefersDark;
}
