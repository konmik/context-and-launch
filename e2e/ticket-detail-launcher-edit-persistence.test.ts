import { describe, it, expect } from "vitest";
import {
  gotoProject, readProjectLauncherConfig, poll,
  setupE2E,
} from "./fixtures.js";
import { openLauncher, setupLauncherTicket } from "./ticket-detail-launcher-shared.js";

describe("Ticket detail launcher edit persistence (e2e, real server)", () => {
  const ctx = setupE2E();
  it("edit toggle freezes preview", async () => {
    await setupLauncherTicket(ctx, "edit-freeze");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    const textBefore = await cm.textContent();
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-template-select"]', "Other");
    await ctx.page.waitForTimeout(500);
    const textAfter = await cm.textContent();
    expect(textAfter).toBe(textBefore);
  }, 60000);

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
});
