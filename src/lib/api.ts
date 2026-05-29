export async function apiFetch(
  url: string,
  init?: RequestInit,
  fallbackError = "Request failed",
): Promise<{ success?: boolean; error?: string; [key: string]: unknown }> {
  try {
    const res = await fetch(url, init);
    return await res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message : fallbackError };
  }
}
