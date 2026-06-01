import { apiFetch } from "./api.js";

export async function deleteProjectAction(
  projectSlug: string,
): Promise<{ success?: boolean; error?: string }> {
  return apiFetch(`/api/projects/${projectSlug}`, {
    method: "DELETE",
  }, "Failed to delete project");
}
