import { describe, it, expect } from "vitest";
import { readAppLauncherConfig, poll, setupE2E } from "./fixtures.js";
import { openSettingsTab } from "./launcher-settings-shared.js";
import { testId, waitVisible } from "./locators.js";

describe("Launcher Settings Skills tab (e2e, real server)", () => {
  const ctx = setupE2E();

  const setup = (suffix: string) => openSettingsTab(ctx, {
    slugBase: `lss-${suffix}`,
    tab: "prompts",
    appLauncherConfig: { skills: [{ name: "alpha-skill", text: "a" }] },
  });

  it("renders add button, row, edit/delete, order-warning", async () => {
    await setup("renders");
    expect(await testId(ctx.page, "launcher-settings-skills-add-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-skills-row").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-skills-edit-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-skills-delete-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-skills-order-warning").count()).toBe(1);
  });

  it("add opens form, fill and submit at app scope writes app skill", async () => {
    await setup("add");
    await testId(ctx.page, "launcher-settings-skills-add-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    await testId(ctx.page, "launcher-settings-item-form-name-input").fill("delta-skill");
    await testId(ctx.page, "launcher-settings-item-form-text-input").fill("delta");
    await testId(ctx.page, "launcher-settings-item-form-scope-app").click();
    await testId(ctx.page, "launcher-settings-item-form-submit").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => a?.skills?.map((s) => s.name).includes("delta-skill") ?? false,
      5000,
    );
    expect(app?.skills?.map((s) => s.name)).toContain("delta-skill");
  });

  it("edit opens dialog with prefilled name", async () => {
    await setup("edit");
    await testId(ctx.page, "launcher-settings-skills-edit-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("alpha-skill");
  });

  it("delete removes the skill from app config", async () => {
    await setup("delete");
    await testId(ctx.page, "launcher-settings-skills-delete-button").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => !(a?.skills?.map((s) => s.name).includes("alpha-skill") ?? false),
      5000,
    );
    expect(app?.skills?.map((s) => s.name)).not.toContain("alpha-skill");
  });

  it("skills drag handle is rendered (reordering covered by launcher-skill-reorder)", async () => {
    await setup("drag-handle");
    expect(await testId(ctx.page, "launcher-settings-skills-drag-handle").count()).toBe(1);
  });
});
