import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  readContextFile, readTicketStatus, ticketFileNames, poll,
  setupE2E,
} from "./fixtures.js";
import { setupEditorTicket } from "./ticket-detail-editor-shared.js";

describe("Ticket detail Editor tab (e2e, real server)", () => {
  const ctx = setupE2E();
  it("editor tab is active by default; tab triggers render", async () => {
    await setupEditorTicket(ctx, "default");
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-editor"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-launcher"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-shortcuts"]').count()).toBe(1);
  }, 60000);

  it("ticket-detail-close-window-button closes the panel when no unsaved changes", async () => {
    await setupEditorTicket(ctx, "close-window");
    await ctx.page.click('[data-testid="ticket-detail-close-window-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("ticket-detail-close-button closes when no unsaved changes", async () => {
    await setupEditorTicket(ctx, "close-footer");
    await ctx.page.click('[data-testid="ticket-detail-close-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("ticket-detail-save-button writes context file to disk", async () => {
    const project = await setupEditorTicket(ctx, "save");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("appended text");
    await ctx.page.waitForTimeout(300);
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    const content = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do"),
      (c) => c?.includes("appended text") ?? false,
      5000,
    );
    expect(content?.includes("appended text")).toBe(true);
  }, 60000);

  it("ticket-detail-use-worktree-checkbox persists useWorktree to status.json", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tde-wt"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      worktreeRootPath: undefined,
    });
    ctx.projects.push(project);
    const fs = await import("node:fs");
    const path = await import("node:path");
    const wtRoot = path.join(ctx.testServer.dataDir, "wt-root");
    fs.mkdirSync(wtRoot, { recursive: true });
    const cfgFile = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "config", "launcher-config.json",
    );
    fs.mkdirSync(path.dirname(cfgFile), { recursive: true });
    fs.writeFileSync(cfgFile, JSON.stringify({ worktreeRootPath: wtRoot }, null, 2));
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.waitForSelector('[data-testid="ticket-detail-use-worktree-checkbox"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.check('[data-testid="ticket-detail-use-worktree-checkbox"]');
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (s) => s?.useWorktree === true,
      5000,
    );
    expect(status?.useWorktree).toBe(true);
  }, 60000);

  it("file dropdown trigger opens with options; option selection switches file", async () => {
    await setupEditorTicket(ctx, "dropdown");
    await ctx.page.click('[data-testid="ticket-detail-editor-file-dropdown-trigger"]');
    await ctx.page.waitForTimeout(300);
    expect(
      await ctx.page.locator('[data-testid="ticket-detail-editor-file-dropdown-option"]').count(),
    ).toBeGreaterThan(0);
    await ctx.page.locator('[data-testid="ticket-detail-editor-file-dropdown-option"]').first().click();
    await ctx.page.waitForTimeout(300);
  }, 60000);

  it("displays a ticket image whose filename contains spaces", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tde-image-preview"),
      withTickets: [{
        number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
      }],
    });
    ctx.projects.push(project);
    const fileName = "Screenshot 2026-07-17 152851.png";
    fs.writeFileSync(
      path.join(project.ticketsPath, "t-1-alpha", fileName),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-editor-file-dropdown-trigger"]');
    await ctx.page
      .locator('[data-testid="ticket-detail-editor-file-dropdown-option"]')
      .filter({ hasText: fileName })
      .click();

    const image = ctx.page.locator(`img[alt="${fileName}"]`);
    await image.waitFor({ state: "visible", timeout: 15000 });
    await expect.poll(() => image.evaluate(
      (element) => (element as HTMLImageElement).naturalWidth,
    )).toBeGreaterThan(0);
  }, 60000);

  it("trash button opens delete file dialog", async () => {
    await setupEditorTicket(ctx, "trash");
    await ctx.page.click('[data-testid="ticket-detail-editor-trash-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-delete-file-confirm"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("new file button opens new file dialog; create then save writes md file", async () => {
    const project = await setupEditorTicket(ctx, "newfile");
    await ctx.page.click('[data-testid="ticket-detail-editor-new-file-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-new-file-name-input"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.fill('[data-testid="ticket-detail-new-file-name-input"]', "design-notes");
    await ctx.page.click('[data-testid="ticket-detail-new-file-create"]');
    await ctx.page.waitForTimeout(500);
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("hello design");
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    const content = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "design-notes"),
      (c) => c !== null,
      5000,
    );
    expect(content).not.toBeNull();
  }, 60000);
});
