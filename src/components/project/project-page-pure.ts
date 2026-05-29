export type SyncResultType =
  | { type: "success" }
  | { type: "conflict" }
  | { type: "error"; message: string };

export function parseSyncResult(result: { status: string; message?: string }): SyncResultType {
  if (result.status === "success") return { type: "success" };
  if (result.status === "conflict") return { type: "conflict" };
  return { type: "error", message: result.message || "Sync failed" };
}
