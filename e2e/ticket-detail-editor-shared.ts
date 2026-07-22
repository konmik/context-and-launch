import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  type E2EContext, type CreatedProject,
} from "./fixtures.js";

export async function setupEditorTicket(ctx: E2EContext, suffix: string): Promise<CreatedProject> {
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug(`tde-${suffix}`),
    withTickets: [{
      number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
      body: "original",
    }],
  });
  ctx.projects.push(project);
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
  await openTicketDetail(ctx.page, "t-1-alpha");
  return project;
}
