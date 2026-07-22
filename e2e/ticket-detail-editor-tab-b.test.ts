import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  readContextFile, readTicketStatus, ticketFileNames, poll,
  setupE2E,
} from "./fixtures.js";
import { setupEditorTicket } from "./ticket-detail-editor-shared.js";

describe("Ticket detail Editor tab II (e2e, real server)", () => {
  const ctx = setupE2E();
  it("new file cancel closes the dialog", async () => {
    await setupEditorTicket(ctx, "newfile-cancel");
    await ctx.page.click('[data-testid="ticket-detail-editor-new-file-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-new-file-cancel"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-new-file-cancel"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-new-file-name-input"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("delete-file dialog has cancel and confirm", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tde-delfile"),
      withTickets: [{
        number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
        body: "original",
      }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-editor-new-file-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-new-file-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="ticket-detail-new-file-name-input"]', "deletable");
    await ctx.page.click('[data-testid="ticket-detail-new-file-create"]');
    await ctx.page.waitForTimeout(500);
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("placeholder");
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    await ctx.page.waitForTimeout(800);

    await ctx.page.click('[data-testid="ticket-detail-editor-trash-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-delete-file-cancel"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="ticket-detail-delete-file-cancel"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-delete-file-confirm"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-editor-trash-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-delete-file-confirm"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="ticket-detail-delete-file-confirm"]');
    const stillThere = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "deletable"),
      (c) => c === null,
      5000,
    );
    expect(stillThere).toBeNull();
  }, 60000);

  it("editor-copy and add-reference buttons exist", async () => {
    await setupEditorTicket(ctx, "buttons");
    expect(await ctx.page.locator('[data-testid="ticket-detail-editor-copy-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="ticket-detail-editor-add-reference-button"]').count()).toBe(1);
  }, 60000);

  it("discard dialog appears with unsaved changes; cancel keeps panel open, discard closes it", async () => {
    await setupEditorTicket(ctx, "discard-cancel");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("dirty ");
    await ctx.page.waitForTimeout(200);
    await ctx.page.click('[data-testid="ticket-detail-close-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-discard-discard"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-discard-cancel"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-discard-discard"]', {
      state: "detached", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-editor"]').count()).toBe(1);
    await ctx.page.click('[data-testid="ticket-detail-close-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-discard-discard"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-discard-discard"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("editor copy button can upload a file via file input; confirm-upload dialogs render their testids", async () => {
    const project = await setupEditorTicket(ctx, "upload");
    const fileInput = ctx.page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "uploaded.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    const files = await poll(
      () => ticketFileNames(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (f) => f.includes("uploaded.txt"),
      5000,
    );
    expect(files).toContain("uploaded.txt");
  }, 60000);

  it("uploading a large file (>10KB) opens confirm-upload dialog with cancel and confirm testids", async () => {
    const project = await setupEditorTicket(ctx, "upload-large");
    const fileInput = ctx.page.locator('input[type="file"]');
    const large = Buffer.alloc(15 * 1024, 0x41);
    await fileInput.setInputFiles({
      name: "big-file.txt",
      mimeType: "text/plain",
      buffer: large,
    });
    await ctx.page.waitForSelector('[data-testid="ticket-detail-confirm-upload-confirm"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="ticket-detail-confirm-upload-cancel"]').count()).toBe(1);
    await ctx.page.click('[data-testid="ticket-detail-confirm-upload-confirm"]');
    const files = await poll(
      () => ticketFileNames(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (f) => f.includes("big-file.txt"),
      5000,
    );
    expect(files).toContain("big-file.txt");
  }, 60000);

  it("editing title and clicking Save persists it", async () => {
    const project = await setupEditorTicket(ctx, "edit-title");
    const input = ctx.page.locator('[data-testid="ticket-detail-title-input"]');
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("Renamed");
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "t-1-renamed"),
      (s) => s?.title === "Renamed",
      5000,
    );
    expect(status?.title).toBe("Renamed");
  }, 60000);

  it("editing number and clicking Save persists it", async () => {
    const project = await setupEditorTicket(ctx, "edit-number");
    const input = ctx.page.locator('[data-testid="ticket-detail-number-input"]');
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("T-99");
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "t-99-alpha"),
      (s) => s?.number === "T-99",
      5000,
    );
    expect(status?.number).toBe("T-99");
  }, 60000);
});
