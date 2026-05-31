import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, setupE2E,
  listTicketFolders, readTicketStatus,
} from "./fixtures.js";

describe("CreateTicketDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openCreate() {
    await ctx.page.click('[data-testid="project-header-new-ticket-button"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', {
      state: "visible", timeout: 15000,
    });
  }

  it("create-ticket-number-input and title-input accept values", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("ct-vals") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCreate();
    await ctx.page.fill('[data-testid="create-ticket-number-input"]', "ABC-1");
    await ctx.page.fill('[data-testid="create-ticket-title-input"]', "First Ticket");
    expect(await ctx.page.inputValue('[data-testid="create-ticket-number-input"]')).toBe("ABC-1");
    expect(await ctx.page.inputValue('[data-testid="create-ticket-title-input"]')).toBe("First Ticket");
  }, 60000);

  it("create-ticket-cancel closes the dialog without creating", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("ct-cancel") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCreate();
    await ctx.page.click('[data-testid="create-ticket-cancel"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', {
      state: "detached", timeout: 15000,
    });
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toEqual([]);
  }, 60000);

  it("create-ticket-submit creates a ticket on disk", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("ct-submit") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCreate();
    await ctx.page.fill('[data-testid="create-ticket-number-input"]', "ABC-1");
    await ctx.page.fill('[data-testid="create-ticket-title-input"]', "First Ticket");
    await ctx.page.click('[data-testid="create-ticket-submit"]');
    await ctx.page.waitForSelector('[data-testid="kanban-board-ticket-card"]', {
      state: "visible", timeout: 10000,
    });
    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    expect(folders.length).toBe(1);
    const status = readTicketStatus(ctx.testServer, project.projectSlug, folders[0]);
    expect(status?.number).toBe("ABC-1");
    expect(status?.title).toBe("First Ticket");
  }, 60000);
});
