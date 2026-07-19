import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  openLauncherSettings, openLauncherSettingsTab,
  readAppLauncherConfig,
  setupE2E,
} from "./fixtures.js";

describe("Launcher Settings Launch tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`lsl-${suffix}`),
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
        shortcuts: [{ name: "Editor", command: "echo editor" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, "launch");
    return project;
  }

  it("renders profile and shortcut sections with add/edit/delete buttons", async () => {
    await setup("renders");
    expect(await ctx.page.locator('[data-testid="launcher-settings-launch-add-profile-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-launch-profile-edit-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-launch-profile-delete-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-launch-add-shortcut-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-launch-shortcut-edit-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-launch-shortcut-delete-button"]').count()).toBe(1);
  }, 60000);

  it("add-profile opens form and submit adds a profile", async () => {
    await setup("add-profile");
    await ctx.page.click('[data-testid="launcher-settings-launch-add-profile-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-item-form-name-input"]', "GPT");
    await ctx.page.fill('[data-testid="launcher-settings-item-form-text-input"]', "echo gpt");
    await ctx.page.click('[data-testid="launcher-settings-item-form-scope-app"]');
    await ctx.page.click('[data-testid="launcher-settings-item-form-submit"]');
    await ctx.page.waitForTimeout(1000);
    const app = readAppLauncherConfig(ctx.testServer);
    expect(app?.profiles?.map((p) => p.name)).toContain("GPT");
  }, 60000);

  it("warns when a command uses a CMD or batch file", async () => {
    await setup("batch-warning");
    await ctx.page.click('[data-testid="launcher-settings-launch-add-profile-button"]');
    const command = ctx.page.locator('[data-testid="launcher-settings-item-form-text-input"]');
    const warning = ctx.page.locator('[data-testid="launcher-settings-item-form-batch-warning"]');

    await command.fill(
      "powershell -File {{configDefaultsDir}}/run-agent.ps1 "
      + "{{initialPrompt}} {{windowTitle}} {{markerPath}} claude1.cmd --dangerously-skip-permissions",
    );
    expect(await warning.count()).toBe(1);
    expect(await warning.textContent()).toContain(
      "Use an .exe or PowerShell script (.ps1) instead.",
    );

    await command.fill("powershell -File run-agent.ps1 {{initialPrompt}}");
    expect(await warning.count()).toBe(0);
  }, 60000);

  it("add-shortcut opens form and submit adds a shortcut", async () => {
    await setup("add-shortcut");
    await ctx.page.click('[data-testid="launcher-settings-launch-add-shortcut-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-item-form-name-input"]', "Browse");
    await ctx.page.fill('[data-testid="launcher-settings-item-form-text-input"]', "echo browse");
    await ctx.page.click('[data-testid="launcher-settings-item-form-scope-app"]');
    await ctx.page.click('[data-testid="launcher-settings-item-form-submit"]');
    await ctx.page.waitForTimeout(1000);
    const app = readAppLauncherConfig(ctx.testServer);
    expect(app?.shortcuts?.map((s) => s.name)).toContain("Browse");
  }, 60000);

  it("delete-profile removes profile from config", async () => {
    await setup("delete-profile");
    await ctx.page.click('[data-testid="launcher-settings-launch-profile-delete-button"]');
    await ctx.page.waitForTimeout(1000);
    const app = readAppLauncherConfig(ctx.testServer);
    expect(app?.profiles?.map((p) => p.name)).not.toContain("Claude");
  }, 60000);

  it("delete-shortcut removes shortcut from config", async () => {
    await setup("delete-shortcut");
    await ctx.page.click('[data-testid="launcher-settings-launch-shortcut-delete-button"]');
    await ctx.page.waitForTimeout(1000);
    const app = readAppLauncherConfig(ctx.testServer);
    expect(app?.shortcuts?.map((s) => s.name)).not.toContain("Editor");
  }, 60000);

  it("edit-profile prefills name", async () => {
    await setup("edit-profile");
    await ctx.page.click('[data-testid="launcher-settings-launch-profile-edit-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("Claude");
  }, 60000);

  it("edit-shortcut prefills name", async () => {
    await setup("edit-shortcut");
    await ctx.page.click('[data-testid="launcher-settings-launch-shortcut-edit-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("Editor");
  }, 60000);
});
