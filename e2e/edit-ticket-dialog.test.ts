import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, clickTicketMenuItem, setupE2E,
  readTicketStatus, listTicketFolders,
} from "./fixtures.js";

describe("EditTicketDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openEdit() {
    await clickTicketMenuItem(ctx.page, "edit");
    await ctx.page.waitForSelector('[data-testid="edit-ticket-title-input"]', {
      state: "visible", timeout: 15000,
    });
  }

  it("edit-ticket-number-input and title-input prefill from ticket", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("et-prefill"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openEdit();
    expect(await ctx.page.inputValue('[data-testid="edit-ticket-number-input"]')).toBe("T-1");
    expect(await ctx.page.inputValue('[data-testid="edit-ticket-title-input"]')).toBe("Alpha");
  }, 60000);

  it("edit-ticket-cancel closes dialog without changes", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("et-cancel"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openEdit();
    await ctx.page.fill('[data-testid="edit-ticket-title-input"]', "Modified");
    await ctx.page.click('[data-testid="edit-ticket-cancel"]');
    await ctx.page.waitForSelector('[data-testid="edit-ticket-title-input"]', {
      state: "detached", timeout: 15000,
    });
    const status = readTicketStatus(ctx.testServer, project.projectSlug, "t-1-alpha");
    expect(status?.title).toBe("Alpha");
  }, 60000);

  it("edit-ticket-submit persists changes to disk", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("et-submit"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openEdit();
    await ctx.page.fill('[data-testid="edit-ticket-title-input"]', "Edited Title");
    await ctx.page.click('[data-testid="edit-ticket-submit"]');
    await ctx.page.waitForTimeout(2000);
    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    const renamed = folders.find((f) => f.includes("edited") || f.includes("Edited"));
    const targetFolder = renamed ?? "t-1-alpha";
    const status = readTicketStatus(ctx.testServer, project.projectSlug, targetFolder);
    expect(status?.title).toBe("Edited Title");
  }, 60000);
});
