import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  type E2EContext, type CreatedProject,
} from "./fixtures.js";

export const APP_LAUNCHER = {
  templates: [
    { name: "Default", text: "do it in {{ticketDir}}\n\n{{skills}}" },
    { name: "Other", text: "other {{ticketDir}}" },
  ],
  profiles: [
    { name: "Claude", command: "echo claude" },
    { name: "GPT", command: "echo gpt" },
  ],
  skills: [
    { name: "alpha-skill", text: "a" },
    { name: "bravo-skill", text: "b" },
  ],
};

export async function openLauncher(ctx: E2EContext): Promise<void> {
  await openTicketDetail(ctx.page, "t-1-alpha");
  await ctx.page.click('[data-testid="ticket-detail-tab-launcher"]');
  await ctx.page.waitForSelector('[data-testid="ticket-detail-launcher-run-button"]', {
    state: "visible", timeout: 15000,
  });
}

export async function setupLauncherTicket(ctx: E2EContext, suffix: string): Promise<CreatedProject> {
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug(`tdl-${suffix}`),
    withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    appLauncherConfig: APP_LAUNCHER,
  });
  ctx.projects.push(project);
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
  await openLauncher(ctx);
  return project;
}
