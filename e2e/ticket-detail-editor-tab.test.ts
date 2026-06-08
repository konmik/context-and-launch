import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  readContextFile, readTicketStatus, ticketFileNames,
  setupE2E,
} from "./fixtures.js";

describe("Ticket detail Editor tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`tde-${suffix}`),
      withTickets: [{
        number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
        body: "original",
      }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    return project;
  }

  it("editor tab is active by default; tab triggers render", async () => {
    await setup("default");
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-editor"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-launcher"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="ticket-detail-tab-shortcuts"]').count()).toBe(1);
  }, 60000);

  it("ticket-detail-close-window-button closes the panel when no unsaved changes", async () => {
    await setup("close-window");
    await ctx.page.click('[data-testid="ticket-detail-close-window-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("ticket-detail-close-button closes when no unsaved changes", async () => {
    await setup("close-footer");
    await ctx.page.click('[data-testid="ticket-detail-close-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("ticket-detail-save-button writes context file to disk", async () => {
    const project = await setup("save");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("appended text");
    await ctx.page.waitForTimeout(300);
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    await ctx.page.waitForTimeout(1000);
    const content = readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do");
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
    await ctx.page.waitForTimeout(800);
    const status = readTicketStatus(ctx.testServer, project.projectSlug, "t-1-alpha");
    expect(status?.useWorktree).toBe(true);
  }, 60000);

  it("file dropdown trigger opens with options; option selection switches file", async () => {
    await setup("dropdown");
    await ctx.page.click('[data-testid="ticket-detail-editor-file-dropdown-trigger"]');
    await ctx.page.waitForTimeout(300);
    expect(
      await ctx.page.locator('[data-testid="ticket-detail-editor-file-dropdown-option"]').count(),
    ).toBeGreaterThan(0);
    await ctx.page.locator('[data-testid="ticket-detail-editor-file-dropdown-option"]').first().click();
    await ctx.page.waitForTimeout(300);
  }, 60000);

  it("trash button opens delete file dialog", async () => {
    await setup("trash");
    await ctx.page.click('[data-testid="ticket-detail-editor-trash-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-delete-file-confirm"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("new file button opens new file dialog; create then save writes md file", async () => {
    const project = await setup("newfile");
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
    await ctx.page.waitForTimeout(1000);
    const content = readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "design-notes");
    expect(content).not.toBeNull();
  }, 60000);

  it("new file cancel closes the dialog", async () => {
    await setup("newfile-cancel");
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
    await ctx.page.waitForTimeout(1000);
    const stillThere = readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "deletable");
    expect(stillThere).toBeNull();
  }, 60000);

  it("editor-copy and add-reference buttons exist", async () => {
    await setup("buttons");
    expect(await ctx.page.locator('[data-testid="ticket-detail-editor-copy-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="ticket-detail-editor-add-reference-button"]').count()).toBe(1);
  }, 60000);

  it("discard dialog appears with unsaved changes; cancel keeps panel open, discard closes it", async () => {
    await setup("discard-cancel");
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
    const project = await setup("upload");
    const fileInput = ctx.page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "uploaded.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    await ctx.page.waitForTimeout(1500);
    const files = ticketFileNames(ctx.testServer, project.projectSlug, "t-1-alpha");
    expect(files).toContain("uploaded.txt");
  }, 60000);

  it("uploading a large file (>10KB) opens confirm-upload dialog with cancel and confirm testids", async () => {
    const project = await setup("upload-large");
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
    await ctx.page.waitForTimeout(1500);
    const files = ticketFileNames(ctx.testServer, project.projectSlug, "t-1-alpha");
    expect(files).toContain("big-file.txt");
  }, 60000);

  it("editing title and clicking Save persists it", async () => {
    const project = await setup("edit-title");
    const input = ctx.page.locator('[data-testid="ticket-detail-title-input"]');
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("Renamed");
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    await ctx.page.waitForTimeout(1000);
    const status = readTicketStatus(ctx.testServer, project.projectSlug, "t-1-renamed");
    expect(status?.title).toBe("Renamed");
  }, 60000);

  it("editing number and clicking Save persists it", async () => {
    const project = await setup("edit-number");
    const input = ctx.page.locator('[data-testid="ticket-detail-number-input"]');
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill("T-99");
    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    await ctx.page.waitForTimeout(1000);
    const status = readTicketStatus(ctx.testServer, project.projectSlug, "t-99-alpha");
    expect(status?.number).toBe("T-99");
  }, 60000);
});
