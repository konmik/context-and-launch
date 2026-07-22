import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  readProjectLauncherConfig, poll,
  setupE2E,
} from "./fixtures.js";
import { APP_LAUNCHER, openLauncher, setupLauncherTicket } from "./ticket-detail-launcher-shared.js";

describe("Ticket detail Launcher tab II (e2e, real server)", () => {
  const ctx = setupE2E();
  it("edit toggle off discards edits", async () => {
    await setupLauncherTicket(ctx, "edit-discard");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const originalText = await cm.textContent();
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    await cm.click();
    await ctx.page.keyboard.type("EXTRA TEXT");
    await ctx.page.waitForTimeout(200);
    const editedText = await cm.textContent();
    expect(editedText).toContain("EXTRA TEXT");
    await toggle.uncheck();
    await ctx.page.waitForTimeout(200);
    const revertedText = await cm.textContent();
    expect(revertedText).not.toContain("EXTRA TEXT");
    expect(revertedText).toBe(originalText);
  }, 60000);

  it("edited prompt persists to project launcher config", async () => {
    const project = await setupLauncherTicket(ctx, "edit-persist");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    await cm.click();
    await ctx.page.keyboard.type("PERSISTED EDIT");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.editedPrompt?.includes("PERSISTED EDIT") ?? false,
      5000,
    );
    expect(cfg?.columnDefaults?.["todo"]?.editedPrompt).toContain("PERSISTED EDIT");
  }, 60000);

  it("edited prompt is restored after reopening the ticket", async () => {
    const project = await setupLauncherTicket(ctx, "edit-restore");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    await cm.click();
    await ctx.page.keyboard.type("RESTORED EDIT");
    await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.editedPrompt?.includes("RESTORED EDIT") ?? false,
      5000,
    );

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncher(ctx);

    const cmReopened = ctx.page.locator('.cm-content');
    await cmReopened.waitFor({ state: "visible", timeout: 15000 });
    const toggleReopened = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    expect(await toggleReopened.isChecked()).toBe(true);
    const text = await cmReopened.textContent();
    expect(text).toContain("RESTORED EDIT");

    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.columnDefaults?.["todo"]?.editedPrompt).toContain("RESTORED EDIT");
  }, 60000);

  it("turning edit off clears the persisted edited prompt", async () => {
    const project = await setupLauncherTicket(ctx, "edit-clear");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    await cm.click();
    await ctx.page.keyboard.type("TEMP EDIT");
    await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.editedPrompt?.includes("TEMP EDIT") ?? false,
      5000,
    );
    await toggle.uncheck();
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.editedPrompt === undefined,
      5000,
    );
    expect(cfg?.columnDefaults?.["todo"]?.editedPrompt).toBeUndefined();
  }, 60000);

  it("launch dir display shows project path when worktree is off", async () => {
    const project = await setupLauncherTicket(ctx, "dir-off");
    const display = ctx.page.locator('[data-testid="launch-dir-display"]');
    await display.waitFor({ state: "visible", timeout: 15000 });
    const text = await display.textContent();
    expect(text).toContain(project.projectPath);
    expect(await ctx.page.locator('[data-testid="launch-dir-copy-button"]').count()).toBe(1);
  }, 60000);

  it("launch dir display updates when worktree toggle changes", async () => {
    const project = await setupLauncherTicket(ctx, "dir-toggle");
    const display = ctx.page.locator('[data-testid="launch-dir-display"]');
    await display.waitFor({ state: "visible", timeout: 15000 });
    const textBefore = await display.textContent();
    expect(textBefore).toContain(project.projectPath);
    const cb = ctx.page.locator('[data-testid="ticket-detail-use-worktree-checkbox"]');
    await cb.check();
    await ctx.page.waitForTimeout(500);
    const textAfter = await display.textContent();
    expect(textAfter).toContain("t-1-alpha");
    expect(textAfter).not.toContain(project.projectPath);
    await cb.uncheck();
    await ctx.page.waitForTimeout(500);
    const textReverted = await display.textContent();
    expect(textReverted).toContain(project.projectPath);
  }, 60000);

  it("cursor stays near original position when prompt updates externally", async () => {
    await setupLauncherTicket(ctx, "cursor-preserve");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });

    const docLen = await ctx.page.evaluate(() => {
      const c = document.querySelector('.cm-content') as any;
      const view = c?.cmTile?.root?.view;
      return view ? view.state.doc.length : -1;
    });
    expect(docLen).toBeGreaterThan(20);

    const middleOffset = Math.floor(docLen / 2);
    await ctx.page.evaluate((offset) => {
      const c = document.querySelector('.cm-content') as any;
      const view = c?.cmTile?.root?.view;
      if (!view) throw new Error("CM view not found");
      view.focus();
      view.dispatch({ selection: { anchor: offset } });
    }, middleOffset);

    const cursorBefore = await ctx.page.evaluate(() => {
      const c = document.querySelector('.cm-content') as any;
      return c?.cmTile?.root?.view?.state?.selection?.main?.anchor ?? -1;
    });
    expect(cursorBefore).toBe(middleOffset);

    const cb = ctx.page.locator(
      '[data-testid="ticket-detail-launcher-skill-checkbox"][data-skill-name="alpha-skill"]',
    );
    await cb.waitFor({ state: "visible", timeout: 15000 });
    await cb.check();
    await ctx.page.waitForTimeout(500);

    const cursorAfter = await ctx.page.evaluate(() => {
      const c = document.querySelector('.cm-content') as any;
      return c?.cmTile?.root?.view?.state?.selection?.main?.anchor ?? -1;
    });

    expect(cursorAfter).toBe(middleOffset);
  }, 60000);

  it("prompt preview interpolates {{launchDir}} placeholder", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tdl-dir-preview"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        ...APP_LAUNCHER,
        templates: [
          { name: "Default", text: "launch in {{launchDir}}" },
        ],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncher(ctx);
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const text = await cm.textContent();
    expect(text).toContain(project.projectPath);
    expect(text).not.toContain("{{launchDir}}");
  }, 60000);
});
