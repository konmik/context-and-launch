import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  openLauncherSettings, openLauncherSettingsTab,
  readAppLauncherConfig, readProjectLauncherConfig, poll,
  setupE2E,
} from "./fixtures.js";

describe("Launcher Settings Prompts tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string, extras?: Parameters<typeof createProject>[1]["appLauncherConfig"]) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`lsp-${suffix}`),
      appLauncherConfig: extras ?? {
        templates: [{ name: "Existing", text: "existing text" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, "prompts");
    return project;
  }

  it("Prompts tab renders Add button and edit/delete on existing item", async () => {
    await setup("renders");
    await ctx.page.locator('[data-testid="launcher-settings-prompts-add-button"]').first()
      .waitFor({ state: "visible", timeout: 15000 });
    expect(await ctx.page.locator('[data-testid="launcher-settings-prompts-add-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-prompts-edit-button"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-prompts-delete-button"]').count()).toBe(1);
  }, 60000);

  it("add button opens ItemFormDialog with name/text inputs and scope radios", async () => {
    await setup("add");
    await ctx.page.click('[data-testid="launcher-settings-prompts-add-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="launcher-settings-item-form-text-input"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-item-form-scope-app"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-item-form-scope-project"]').count()).toBe(1);
  }, 60000);

  it("cancel closes the dialog without saving", async () => {
    await setup("cancel");
    await ctx.page.click('[data-testid="launcher-settings-prompts-add-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-cancel"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-item-form-name-input"]', "cancelled");
    await ctx.page.click('[data-testid="launcher-settings-item-form-cancel"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("submit at app scope writes to app launcher config", async () => {
    await setup("submit-app");
    await ctx.page.click('[data-testid="launcher-settings-prompts-add-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-item-form-name-input"]', "Brand New");
    await ctx.page.fill('[data-testid="launcher-settings-item-form-text-input"]', "do something new");
    await ctx.page.click('[data-testid="launcher-settings-item-form-scope-app"]');
    await ctx.page.click('[data-testid="launcher-settings-item-form-submit"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', {
      state: "detached", timeout: 15000,
    });
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => a?.templates?.map((t) => t.name).includes("Brand New") ?? false,
      5000,
    );
    expect(app?.templates?.map((t) => t.name)).toContain("Brand New");
  }, 60000);

  it("submit at project scope writes to project launcher config", async () => {
    const project = await setup("submit-project");
    await ctx.page.click('[data-testid="launcher-settings-prompts-add-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-item-form-name-input"]', "Project Prompt");
    await ctx.page.fill('[data-testid="launcher-settings-item-form-text-input"]', "for this project");
    await ctx.page.click('[data-testid="launcher-settings-item-form-scope-project"]');
    await ctx.page.click('[data-testid="launcher-settings-item-form-submit"]');
    const proj = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (p) => p?.templates?.map((t) => t.name).includes("Project Prompt") ?? false,
      5000,
    );
    expect(proj?.templates?.map((t) => t.name)).toContain("Project Prompt");
  }, 60000);

  it("edit button opens dialog with prefilled name", async () => {
    await setup("edit");
    await ctx.page.click('[data-testid="launcher-settings-prompts-edit-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-item-form-name-input"]', { timeout: 15000 });
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("Existing");
  }, 60000);

  it("delete button removes template from app config", async () => {
    await setup("delete");
    await ctx.page.click('[data-testid="launcher-settings-prompts-delete-button"]');
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => !(a?.templates?.map((t) => t.name).includes("Existing") ?? false),
      5000,
    );
    expect(app?.templates?.map((t) => t.name)).not.toContain("Existing");
  }, 60000);
});
