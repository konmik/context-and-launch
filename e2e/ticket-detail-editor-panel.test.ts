import { describe, it, expect } from "vitest";
import {
  gotoProject, seedProject, openTicketDetail,
  readContextFile, readTicketStatus, poll, setupE2E,
} from "./fixtures.js";
import { setupEditorTicket } from "./ticket-detail-editor-shared.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Ticket detail editor panel and saving (e2e, real server)", () => {
  const ctx = setupE2E();
  it("editor tab is active by default; tab triggers render", async () => {
    await setupEditorTicket(ctx, "default");
    expect(await testId(ctx.page, "ticket-detail-tab-editor").count()).toBe(1);
    expect(await testId(ctx.page, "ticket-detail-tab-launcher").count()).toBe(1);
    expect(await testId(ctx.page, "ticket-detail-tab-shortcuts").count()).toBe(0);
  });

  it("editor-copy and add-reference buttons exist", async () => {
    await setupEditorTicket(ctx, "buttons");
    expect(await testId(ctx.page, "ticket-detail-editor-copy-button").count()).toBe(1);
    expect(await testId(ctx.page, "ticket-detail-editor-add-reference-button").count()).toBe(1);
  });

  it("ticket-detail-close-window-button closes the panel when no unsaved changes", async () => {
    await setupEditorTicket(ctx, "close-window");
    await testId(ctx.page, "ticket-detail-close-window-button").click();
    await waitGone(ctx.page, "ticket-detail-tab-editor");
  });

  it("ticket-detail-close-button closes when no unsaved changes", async () => {
    await setupEditorTicket(ctx, "close-footer");
    await testId(ctx.page, "ticket-detail-close-button").click();
    await waitGone(ctx.page, "ticket-detail-tab-editor");
  });

  it("discard dialog appears with unsaved changes; cancel keeps panel open, discard closes it", async () => {
    await setupEditorTicket(ctx, "discard-cancel");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("dirty ");
    await ctx.page.waitForTimeout(200);
    await testId(ctx.page, "ticket-detail-close-button").click();
    await waitVisible(ctx.page, "ticket-detail-discard-discard");
    await testId(ctx.page, "ticket-detail-discard-cancel").click();
    await waitGone(ctx.page, "ticket-detail-discard-discard");
    expect(await testId(ctx.page, "ticket-detail-tab-editor").count()).toBe(1);
    await testId(ctx.page, "ticket-detail-close-button").click();
    await waitVisible(ctx.page, "ticket-detail-discard-discard");
    await testId(ctx.page, "ticket-detail-discard-discard").click();
    await waitGone(ctx.page, "ticket-detail-tab-editor");
  });

  it("ticket-detail-save-button writes context file to disk", async () => {
    const project = await setupEditorTicket(ctx, "save");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("appended text");
    await ctx.page.waitForTimeout(300);
    await testId(ctx.page, "ticket-detail-save-button").click();
    const content = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do"),
      (c) => c?.includes("appended text") ?? false,
      5000,
    );
    expect(content?.includes("appended text")).toBe(true);
  });

  it("ticket-detail-use-worktree-checkbox persists useWorktree to status.json", async () => {
    const project = await seedProject(ctx, {
      slugBase: "tde-wt",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      worktreeRootPath: undefined,
    });
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
    await waitVisible(ctx.page, "ticket-detail-use-worktree-checkbox");
    await ctx.page.check('[data-testid="ticket-detail-use-worktree-checkbox"]');
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (s) => s?.useWorktree === true,
      5000,
    );
    expect(status?.useWorktree).toBe(true);
  });

  it("editing title and clicking Save persists it", async () => {
    const project = await setupEditorTicket(ctx, "edit-title");
    const input = testId(ctx.page, "ticket-detail-title-input");
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("Renamed");
    await testId(ctx.page, "ticket-detail-save-button").click();
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "t-1-renamed"),
      (s) => s?.title === "Renamed",
      5000,
    );
    expect(status?.title).toBe("Renamed");
  });

  it("editing number and clicking Save persists it", async () => {
    const project = await setupEditorTicket(ctx, "edit-number");
    const input = testId(ctx.page, "ticket-detail-number-input");
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("T-99");
    await testId(ctx.page, "ticket-detail-save-button").click();
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "t-99-alpha"),
      (s) => s?.number === "T-99",
      5000,
    );
    expect(status?.number).toBe("T-99");
  });
});
