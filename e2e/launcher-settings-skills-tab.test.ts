import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  openLauncherSettings, openLauncherSettingsTab,
  readAppLauncherConfig,
  setupE2E,
} from "./fixtures.js";

describe("Launcher Settings Skills tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`lss-${suffix}`),
      appLauncherConfig: {
        skills: [{ name: "alpha-skill", text: "a" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, "prompts");
    return project;
  }

  it("renders add button, row, edit/delete, order-warning", async () => {
    await setup("renders");
    expect(await ctx.page.locator('[data-testid="launcher-settings-skills-add-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-skills-row"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-skills-edit-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-skills-delete-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-skills-order-warning"]').count()).toBe(1);
  }, 60000);

  it("add opens form, fill and submit at app scope writes app skill", async () => {
    await setup("add");
    await ctx.page.click('[data-testid="launcher-settings-skills-add-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-item-form-name-input"]', "delta-skill");
    await ctx.page.fill('[data-testid="launcher-settings-item-form-text-input"]', "delta");
    await ctx.page.click('[data-testid="launcher-settings-item-form-scope-app"]');
    await ctx.page.click('[data-testid="launcher-settings-item-form-submit"]');
    await ctx.page.waitForTimeout(1000);
    const app = readAppLauncherConfig(ctx.testServer);
    expect(app?.skills?.map((s) => s.name)).toContain("delta-skill");
  }, 60000);

  it("edit opens dialog with prefilled name", async () => {
    await setup("edit");
    await ctx.page.click('[data-testid="launcher-settings-skills-edit-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("alpha-skill");
  }, 60000);

  it("delete removes the skill from app config", async () => {
    await setup("delete");
    await ctx.page.click('[data-testid="launcher-settings-skills-delete-button"]');
    await ctx.page.waitForTimeout(1000);
    const app = readAppLauncherConfig(ctx.testServer);
    expect(app?.skills?.map((s) => s.name)).not.toContain("alpha-skill");
  }, 60000);

  it("skills drag handle is rendered (reordering covered by launcher-skill-reorder)", async () => {
    await setup("drag-handle");
    expect(await ctx.page.locator('[data-testid="launcher-settings-skills-drag-handle"]').count()).toBe(1);
  }, 60000);
});
