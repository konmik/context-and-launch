export async function addProjectAction(pathValue: string) {
  "use server";
  const { projectRegistry } = await import("~/lib/server/instances.js");
  const { errorMessage } = await import("~/lib/server/errors.js");
  try {
    const project = projectRegistry.addProject(pathValue);
    return { slug: project.slug };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
