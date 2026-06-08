import { apiFetch } from "./api.js";

export async function addProjectAction(
  pathValue: string, branch?: string, mainBranch?: string, boardId?: string,
  name?: string,
): Promise<{ projectSlug?: string; error?: string }> {
  return apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: pathValue, branch, mainBranch, boardId, name }),
  }, "Failed to add project");
}
