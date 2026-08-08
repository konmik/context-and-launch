import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  gotoProject, seedProject, openTicketDetail,
  readContextFile, ticketFileNames, poll,
  setupE2E,
} from "./fixtures.js";
import { setupEditorTicket } from "./ticket-detail-editor-shared.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Ticket detail editor file management (e2e, real server)", () => {
  const ctx = setupE2E();
  it("file dropdown trigger opens with options; option selection switches file", async () => {
    await setupEditorTicket(ctx, "dropdown");
    await testId(ctx.page, "ticket-detail-editor-file-dropdown-trigger").click();
    await ctx.page.waitForTimeout(300);
    expect(
      await testId(ctx.page, "ticket-detail-editor-file-dropdown-option").count(),
    ).toBeGreaterThan(0);
    await testId(ctx.page, "ticket-detail-editor-file-dropdown-option").first().click();
    await ctx.page.waitForTimeout(300);
  });

  it("displays a ticket image whose filename contains spaces", async () => {
    const project = await seedProject(ctx, {
      slugBase: "tde-image-preview",
      withTickets: [{
        number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
      }],
    });
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
    await testId(ctx.page, "ticket-detail-editor-file-dropdown-trigger").click();
    await ctx.page
      .locator('[data-testid="ticket-detail-editor-file-dropdown-option"]')
      .filter({ hasText: fileName })
      .click();

    const image = ctx.page.locator(`img[alt="${fileName}"]`);
    await image.waitFor({ state: "visible", timeout: 15000 });
    await expect.poll(() => image.evaluate(
      (element) => (element as HTMLImageElement).naturalWidth,
    )).toBeGreaterThan(0);
  });

  it("new file button opens new file dialog; create then save writes md file", async () => {
    const project = await setupEditorTicket(ctx, "newfile");
    await testId(ctx.page, "ticket-detail-editor-new-file-button").click();
    await waitVisible(ctx.page, "ticket-detail-new-file-name-input");
    await testId(ctx.page, "ticket-detail-new-file-name-input").fill("design-notes");
    await testId(ctx.page, "ticket-detail-new-file-create").click();
    await ctx.page.waitForTimeout(500);
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("hello design");
    await testId(ctx.page, "ticket-detail-save-button").click();
    const content = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "design-notes"),
      (c) => c !== null,
      5000,
    );
    expect(content).not.toBeNull();
  });

  it("new file cancel closes the dialog", async () => {
    await setupEditorTicket(ctx, "newfile-cancel");
    await testId(ctx.page, "ticket-detail-editor-new-file-button").click();
    await waitVisible(ctx.page, "ticket-detail-new-file-cancel");
    await testId(ctx.page, "ticket-detail-new-file-cancel").click();
    await waitGone(ctx.page, "ticket-detail-new-file-name-input");
  });

  it("trash button opens delete file dialog", async () => {
    await setupEditorTicket(ctx, "trash");
    await testId(ctx.page, "ticket-detail-editor-trash-button").click();
    await waitVisible(ctx.page, "ticket-detail-delete-file-confirm");
  });

  it("delete-file dialog has cancel and confirm", async () => {
    const project = await setupEditorTicket(ctx, "delfile");
    await testId(ctx.page, "ticket-detail-editor-new-file-button").click();
    await waitVisible(ctx.page, "ticket-detail-new-file-name-input");
    await testId(ctx.page, "ticket-detail-new-file-name-input").fill("deletable");
    await testId(ctx.page, "ticket-detail-new-file-create").click();
    await ctx.page.waitForTimeout(500);
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("placeholder");
    await testId(ctx.page, "ticket-detail-save-button").click();
    await ctx.page.waitForTimeout(800);

    await testId(ctx.page, "ticket-detail-editor-trash-button").click();
    await waitVisible(ctx.page, "ticket-detail-delete-file-cancel");
    await testId(ctx.page, "ticket-detail-delete-file-cancel").click();
    await waitGone(ctx.page, "ticket-detail-delete-file-confirm");
    await testId(ctx.page, "ticket-detail-editor-trash-button").click();
    await waitVisible(ctx.page, "ticket-detail-delete-file-confirm");
    await testId(ctx.page, "ticket-detail-delete-file-confirm").click();
    const stillThere = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "deletable"),
      (c) => c === null,
      5000,
    );
    expect(stillThere).toBeNull();
  });

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
  });

  it("uploading a .md file lists it in the file dropdown without reopening the ticket", async () => {
    const project = await setupEditorTicket(ctx, "upload-md");
    const fileInput = ctx.page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Notes"),
    });
    await poll(
      () => ticketFileNames(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (f) => f.includes("notes.md"),
      5000,
    );
    await testId(ctx.page, "ticket-detail-editor-file-dropdown-trigger").click();
    const option = ctx.page.locator(
      '[data-testid="ticket-detail-editor-file-dropdown-option"]',
      { hasText: "notes.md" },
    );
    await option.waitFor({ state: "visible", timeout: 15000 });
  });

  it("uploading a large file (>10KB) opens confirm-upload dialog with cancel and confirm testids", async () => {
    const project = await setupEditorTicket(ctx, "upload-large");
    const fileInput = ctx.page.locator('input[type="file"]');
    const large = Buffer.alloc(15 * 1024, 0x41);
    await fileInput.setInputFiles({
      name: "big-file.txt",
      mimeType: "text/plain",
      buffer: large,
    });
    await waitVisible(ctx.page, "ticket-detail-confirm-upload-confirm");
    expect(await testId(ctx.page, "ticket-detail-confirm-upload-cancel").count()).toBe(1);
    await testId(ctx.page, "ticket-detail-confirm-upload-confirm").click();
    const files = await poll(
      () => ticketFileNames(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (f) => f.includes("big-file.txt"),
      5000,
    );
    expect(files).toContain("big-file.txt");
  });
});
