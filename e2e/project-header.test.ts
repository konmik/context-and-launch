import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, getLocalStorageItem,
  setupE2E,
} from "./fixtures.js";

describe("Project page header toolbar (e2e, real server)", () => {
  const ctx = setupE2E();

  it("theme-toggle-button toggles dark class and writes localStorage", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-theme") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="theme-toggle-button"]', { state: "visible", timeout: 15000 });
    const before = await ctx.page.evaluate(() => document.documentElement.classList.contains("dark"));
    await ctx.page.click('[data-testid="theme-toggle-button"]');
    await ctx.page.waitForFunction(
      (was) => document.documentElement.classList.contains("dark") !== was,
      before, { timeout: 3000 },
    );
    const theme = await getLocalStorageItem(ctx.page, "theme");
    expect(theme === "light" || theme === "dark").toBe(true);
  }, 60000);

  it("project-header-settings-button opens the settings panel", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-settings") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="project-header-settings-button"]');
    await ctx.page.waitForSelector('[data-scope="floating-panel"][data-part="content"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-misc"]').count()).toBe(1);
  }, 60000);

  it("project-header-project-dropdown-trigger opens menu with all projects", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-menu") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
    await ctx.page.locator('[role="menuitem"]').first().waitFor({ state: "visible", timeout: 10000 });
    expect(await ctx.page.locator('[role="menuitem"]').count()).toBeGreaterThan(0);
  }, 60000);

  it("project-header-project-item navigates to that project", async () => {
    const a = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-nav-a") });
    const b = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-nav-b") });
    ctx.projects.push(a, b);
    await gotoProject(ctx.page, ctx.testServer, a.projectSlug);
    await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
    const item = ctx.page.locator(`[data-testid="project-header-project-item"]`, { hasText: b.projectSlug }).first();
    await item.waitFor({ state: "visible", timeout: 10000 });
    await item.click();
    await ctx.page.waitForURL(`**/project/${b.projectSlug}`, { timeout: 10000 });
  }, 60000);

  it("project-header-add-project-menuitem opens add-project dialog", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-add") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
    await ctx.page.locator('[data-testid="project-header-add-project-menuitem"]').waitFor({
      state: "visible", timeout: 10000,
    });
    await ctx.page.click('[data-testid="project-header-add-project-menuitem"]');
    await ctx.page.waitForSelector('[data-testid="add-project-path-input"]', { state: "visible", timeout: 15000 });
  }, 60000);

  it("project-header-new-ticket-button opens create-ticket dialog", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("hdr-new-ticket") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="project-header-new-ticket-button"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', { state: "visible", timeout: 15000 });
  }, 60000);
});
