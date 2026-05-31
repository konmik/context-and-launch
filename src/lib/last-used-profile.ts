export async function fetchLastUsedProfile(): Promise<string | null> {
  const res = await fetch("/api/last-used-profile");
  if (!res.ok) throw new Error("Failed to load last used profile");
  const data = await res.json();
  return typeof data.profileName === "string" ? data.profileName : null;
}

export async function saveLastUsedProfile(profileName: string): Promise<void> {
  const res = await fetch("/api/last-used-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to save last used profile");
  }
}
