import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, clickTicketMenuItem, setupE2E,
} from "./fixtures.js";

describe("Kanban board (e2e, real server)", () => {
  const ctx = setupE2E();

  it("renders kanban-board-column-header and kanban-board-column-description", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-cols"),
      withBoards: [{
        id: "kanban", name: "Kanban",
        columns: [
          { name: "todo", description: "Things to do" },
          { name: "done" },
        ],
      }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    const headers = await ctx.page.locator('[data-testid="kanban-board-column-header"]').allTextContents();
    expect(headers.map(h => h.trim().toLowerCase())).toContain("todo");
    const desc = ctx.page.locator('[data-testid="kanban-board-column-description"]').first();
    expect(await desc.textContent()).toBe("Things to do");
  }, 60000);

  it("kanban-board-empty-dropzone renders for empty columns", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-empty"),
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    expect(await ctx.page.locator('[data-testid="kanban-board-empty-dropzone"]').count()).toBeGreaterThan(0);
  }, 60000);

  it("kanban-board-ticket-card click opens ticket detail dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-click"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.locator('[data-testid="kanban-board-ticket-card"]').first().click();
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', { state: "visible", timeout: 15000 });
  }, 60000);

  it("kanban-board-ticket-menu-trigger opens menu with edit/archive/delete items", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-menu"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    const trigger = ctx.page.locator('[data-testid="kanban-board-ticket-menu-trigger"]').first();
    await trigger.click();
    await ctx.page.locator('[data-testid="kanban-board-ticket-menu-edit"]').waitFor({
      state: "visible", timeout: 10000,
    });
    expect(await ctx.page.locator('[data-testid="kanban-board-ticket-menu-edit"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="kanban-board-ticket-menu-archive"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="kanban-board-ticket-menu-delete"]').count()).toBe(1);
  }, 60000);

  it("kanban-board-ticket-menu-edit opens Edit Ticket dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-edit-menu"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await clickTicketMenuItem(ctx.page, "edit");
    await ctx.page.waitForSelector('[data-testid="edit-ticket-title-input"]', { state: "visible", timeout: 15000 });
  }, 60000);

  it("kanban-board-ticket-menu-archive opens Archive Ticket dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-arch-menu"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await clickTicketMenuItem(ctx.page, "archive");
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', { state: "visible", timeout: 15000 });
  }, 60000);

  it("kanban-board-ticket-menu-delete opens Delete Ticket dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-del-menu"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await clickTicketMenuItem(ctx.page, "delete");
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', { state: "visible", timeout: 15000 });
  }, 60000);

  it("kanban-board-undefined-column and related testids render for orphan-status tickets", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("kb-orphan"),
      withBoards: [{
        id: "kanban", name: "Kanban",
        columns: [{ name: "todo" }, { name: "done" }],
      }],
      withTickets: [{
        number: "T-9", title: "Orphan", status: "missing-col", folderName: "t-9-orphan",
      }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="kanban-board-undefined-column"]', {
      state: "visible", timeout: 15000,
    });
    expect(
      await ctx.page.locator('[data-testid="kanban-board-undefined-column-description"]').textContent(),
    ).toBe("Update manually");
    expect(
      await ctx.page.locator('[data-testid="kanban-board-ticket-orphaned-status"]').textContent(),
    ).toBe("missing-col");
  }, 60000);
});
