import { apiFetch } from "./api.js";

export async function addProjectAction(
  pathValue: string, branch?: string, worktreeRootPath?: string, ticketsPath?: string,
  mainBranch?: string, boardId?: string,
): Promise<{ projectSlug?: string; error?: string }> {
  return apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: pathValue, branch, worktreeRootPath, ticketsPath, mainBranch, boardId }),
  }, "Failed to add project");
}
