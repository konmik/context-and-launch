import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  openProject, seedProject, gotoProject,
  getLocalStorageItem, setupE2E,
} from "./fixtures.js";
import { testId, waitVisible } from "./locators.js";

describe("Project page header toolbar (e2e, real server)", () => {
  const ctx = setupE2E();

  it("palette-picker mode toggle switches dark class and writes localStorage", async () => {
    const project = await openProject(ctx, { slugBase: "hdr-theme" });
    await waitVisible(ctx.page, "palette-picker-trigger");
    const before = await ctx.page.evaluate(() => document.documentElement.classList.contains("dark"));
    await testId(ctx.page, "palette-picker-trigger").click();
    await testId(ctx.page, "palette-picker-mode-toggle").click();
    await ctx.page.waitForFunction(
      (was) => document.documentElement.classList.contains("dark") !== was,
      before, { timeout: 3000 },
    );
    const theme = await getLocalStorageItem(ctx.page, `theme:${project.projectSlug}`);
    expect(theme === "light" || theme === "dark").toBe(true);
    expect(await getLocalStorageItem(ctx.page, "theme")).toBeNull();
  });

  it("keeps the project shell visible without a modal backdrop when tickets fail to load", async () => {
    const project = await seedProject(ctx, {
      slugBase: "hdr-load-error",
      withTickets: [{ number: "ST-0001", title: "Test", status: "todo" }],
    });

    const dotGit = path.join(project.ticketsPath, ".git");
    const heldDotGit = path.join(project.ticketsPath, ".git-held-for-test");
    fs.renameSync(dotGit, heldDotGit);
    try {
      await ctx.page.goto(`${ctx.testServer.baseUrl}/project/${project.projectSlug}`);
      await waitVisible(ctx.page, "project-load-error");
      await waitVisible(ctx.page, "project-header-settings-button");
      expect(await testId(ctx.page, "project-header-settings-button").count()).toBe(1);
      expect(await ctx.page.locator('[data-scope="dialog"][data-part="backdrop"]').count()).toBe(0);
    } finally {
      fs.renameSync(heldDotGit, dotGit);
    }
  });

  it("project-header-settings-button opens the settings panel", async () => {
    await openProject(ctx, { slugBase: "hdr-settings" });
    await testId(ctx.page, "project-header-settings-button").click();
    await ctx.page.waitForSelector('[data-scope="floating-panel"][data-part="content"]', {
      state: "visible", timeout: 15000,
    });
    expect(await testId(ctx.page, "launcher-settings-tab-misc").count()).toBe(1);
  });

  it("project-header-project-dropdown-trigger opens menu with all projects", async () => {
    await openProject(ctx, { slugBase: "hdr-menu" });
    await testId(ctx.page, "project-header-project-dropdown-trigger").click();
    await testId(ctx.page, "project-header-project-item").first().waitFor({
      state: "visible", timeout: 10000,
    });
    expect(await testId(ctx.page, "project-header-project-item").count()).toBeGreaterThan(0);
  });

  it("project-header-project-item navigates to that project", async () => {
    const a = await seedProject(ctx, { slugBase: "hdr-nav-a" });
    const b = await seedProject(ctx, { slugBase: "hdr-nav-b" });
    ctx.projects.push(a, b);
    await gotoProject(ctx.page, ctx.testServer, a.projectSlug);
    await testId(ctx.page, "project-header-project-dropdown-trigger").click();
    const item = ctx.page.locator(`[data-testid="project-header-project-item"]`, { hasText: b.projectSlug }).first();
    await item.waitFor({ state: "visible", timeout: 10000 });
    await item.click();
    await ctx.page.waitForURL(`**/project/${b.projectSlug}`, { timeout: 10000 });
  });

  it("project-header-add-project-menuitem opens add-project dialog", async () => {
    await openProject(ctx, { slugBase: "hdr-add" });
    await testId(ctx.page, "project-header-project-dropdown-trigger").click();
    await testId(ctx.page, "project-header-add-project-menuitem").waitFor({
      state: "visible", timeout: 10000,
    });
    await testId(ctx.page, "project-header-add-project-menuitem").click();
    await waitVisible(ctx.page, "add-project-path-input");
  });

  it("project-header-new-ticket-button opens create-ticket dialog", async () => {
    await openProject(ctx, { slugBase: "hdr-new-ticket" });
    await testId(ctx.page, "project-header-new-ticket-button").click();
    await waitVisible(ctx.page, "create-ticket-number-input");
  });
});
