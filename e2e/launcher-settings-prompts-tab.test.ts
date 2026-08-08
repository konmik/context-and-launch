import { describe, it, expect } from "vitest";
import {
  readAppLauncherConfig, readProjectLauncherConfig, poll,
  setupE2E, type SeedAppLauncherConfig,
} from "./fixtures.js";
import { openSettingsTab } from "./launcher-settings-shared.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Launcher Settings Prompts tab (e2e, real server)", () => {
  const ctx = setupE2E();

  const setup = (suffix: string, appLauncherConfig?: SeedAppLauncherConfig) =>
    openSettingsTab(ctx, {
      slugBase: `lsp-${suffix}`,
      tab: "prompts",
      appLauncherConfig: appLauncherConfig ?? {
        templates: [{ name: "Existing", text: "existing text" }],
      },
    });

  it("Prompts tab renders Add button and edit/delete on existing item", async () => {
    await setup("renders");
    await testId(ctx.page, "launcher-settings-prompts-add-button").first()
      .waitFor({ state: "visible", timeout: 15000 });
    expect(await testId(ctx.page, "launcher-settings-prompts-add-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-prompts-edit-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-prompts-delete-button").count()).toBe(1);
  });

  it("add button opens ItemFormDialog with name/text inputs and scope radios", async () => {
    await setup("add");
    await testId(ctx.page, "launcher-settings-prompts-add-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    expect(await testId(ctx.page, "launcher-settings-item-form-text-input").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-item-form-scope-app").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-item-form-scope-project").count()).toBe(1);
  });

  it("cancel closes the dialog without saving", async () => {
    await setup("cancel");
    await testId(ctx.page, "launcher-settings-prompts-add-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-cancel");
    await testId(ctx.page, "launcher-settings-item-form-name-input").fill("cancelled");
    await testId(ctx.page, "launcher-settings-item-form-cancel").click();
    await waitGone(ctx.page, "launcher-settings-item-form-name-input");
  });

  it("submit at app scope writes to app launcher config", async () => {
    await setup("submit-app");
    await testId(ctx.page, "launcher-settings-prompts-add-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    await testId(ctx.page, "launcher-settings-item-form-name-input").fill("Brand New");
    await testId(ctx.page, "launcher-settings-item-form-text-input").fill("do something new");
    await testId(ctx.page, "launcher-settings-item-form-scope-app").click();
    await testId(ctx.page, "launcher-settings-item-form-submit").click();
    await waitGone(ctx.page, "launcher-settings-item-form-name-input");
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => a?.templates?.map((t) => t.name).includes("Brand New") ?? false,
      5000,
    );
    expect(app?.templates?.map((t) => t.name)).toContain("Brand New");
  });

  it("submit at project scope writes to project launcher config", async () => {
    const project = await setup("submit-project");
    await testId(ctx.page, "launcher-settings-prompts-add-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    await testId(ctx.page, "launcher-settings-item-form-name-input").fill("Project Prompt");
    await testId(ctx.page, "launcher-settings-item-form-text-input").fill("for this project");
    await testId(ctx.page, "launcher-settings-item-form-scope-project").click();
    await testId(ctx.page, "launcher-settings-item-form-submit").click();
    const proj = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (p) => p?.templates?.map((t) => t.name).includes("Project Prompt") ?? false,
      5000,
    );
    expect(proj?.templates?.map((t) => t.name)).toContain("Project Prompt");
  });

  it("edit button opens dialog with prefilled name", async () => {
    await setup("edit");
    await testId(ctx.page, "launcher-settings-prompts-edit-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("Existing");
  });

  it("delete button removes template from app config", async () => {
    await setup("delete");
    await testId(ctx.page, "launcher-settings-prompts-delete-button").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => !(a?.templates?.map((t) => t.name).includes("Existing") ?? false),
      5000,
    );
    expect(app?.templates?.map((t) => t.name)).not.toContain("Existing");
  });
});
