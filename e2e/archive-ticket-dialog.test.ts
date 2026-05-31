import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, clickTicketMenuItem, setupE2E,
  listTicketFolders,
} from "./fixtures.js";

describe("ArchiveTicketDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openArchive() {
    await clickTicketMenuItem(ctx.page, "archive");
    await ctx.page.waitForSelector('[data-testid="archive-ticket-submit"]', {
      state: "visible", timeout: 15000,
    });
  }

  it("archive-ticket-cancel closes dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("at-cancel"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openArchive();
    await ctx.page.click('[data-testid="archive-ticket-cancel"]');
    await ctx.page.waitForSelector('[data-testid="archive-ticket-submit"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("archive-ticket-submit moves ticket folder to archive on disk", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("at-submit"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openArchive();
    await ctx.page.click('[data-testid="archive-ticket-submit"]');
    await ctx.page.waitForTimeout(2000);
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
    const archived = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets", "archive", "t-1-alpha",
    );
    expect(fs.existsSync(archived)).toBe(true);
    expect(await ctx.page.locator('[data-testid="kanban-board-ticket-card"]').count()).toBe(0);
  }, 60000);
});
