export function extractProfiles(data: unknown): { name: string }[] {
  if (!data || typeof data !== "object") return [];
  const profiles = (data as Record<string, unknown>).profiles;
  if (!Array.isArray(profiles)) return [];
  return profiles.map((p: any) => ({ name: p.name }));
}
