import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, clickTicketMenuItem, setupE2E,
  listTicketFolders,
} from "./fixtures.js";

describe("DeleteTicketDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openDelete() {
    await clickTicketMenuItem(ctx.page, "delete");
    await ctx.page.waitForSelector('[data-testid="delete-ticket-submit"]', {
      state: "visible", timeout: 15000,
    });
  }

  it("delete-ticket-cancel keeps ticket on disk", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("dt-cancel"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openDelete();
    await ctx.page.click('[data-testid="delete-ticket-cancel"]');
    await ctx.page.waitForSelector('[data-testid="delete-ticket-submit"]', {
      state: "detached", timeout: 15000,
    });
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toContain("t-1-alpha");
  }, 60000);

  it("delete-ticket-submit removes ticket folder from disk", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("dt-submit"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openDelete();
    await ctx.page.click('[data-testid="delete-ticket-submit"]');
    await ctx.page.waitForTimeout(2000);
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
  }, 60000);
});
