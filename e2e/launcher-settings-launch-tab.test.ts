import { describe, it, expect } from "vitest";
import { readAppLauncherConfig, poll, setupE2E } from "./fixtures.js";
import { openSettingsTab } from "./launcher-settings-shared.js";
import { testId, waitVisible } from "./locators.js";

describe("Launcher Settings Launch tab (e2e, real server)", () => {
  const ctx = setupE2E();

  const setup = (suffix: string) => openSettingsTab(ctx, {
    slugBase: `lsl-${suffix}`,
    tab: "launch",
    appLauncherConfig: {
      profiles: [{ name: "Claude", command: "echo claude" }],
      shortcuts: [{ name: "Editor", command: "echo editor" }],
    },
  });

  it("renders profile and shortcut sections with add/edit/delete buttons", async () => {
    await setup("renders");
    expect(await testId(ctx.page, "launcher-settings-launch-add-profile-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-launch-profile-edit-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-launch-profile-delete-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-launch-add-shortcut-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-launch-shortcut-edit-button").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-launch-shortcut-delete-button").count()).toBe(1);
  });

  it("add-profile opens form and submit adds a profile", async () => {
    await setup("add-profile");
    await testId(ctx.page, "launcher-settings-launch-add-profile-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    await testId(ctx.page, "launcher-settings-item-form-name-input").fill("GPT");
    await testId(ctx.page, "launcher-settings-item-form-text-input").fill("echo gpt");
    await testId(ctx.page, "launcher-settings-item-form-scope-app").click();
    await testId(ctx.page, "launcher-settings-item-form-submit").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => a?.profiles?.map((p) => p.name).includes("GPT") ?? false,
      5000,
    );
    expect(app?.profiles?.map((p) => p.name)).toContain("GPT");
  });

  it("warns when a command uses a CMD or batch file", async () => {
    await setup("batch-warning");
    await testId(ctx.page, "launcher-settings-launch-add-profile-button").click();
    const command = testId(ctx.page, "launcher-settings-item-form-text-input");
    const warning = testId(ctx.page, "launcher-settings-item-form-batch-warning");

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
  });

  it("add-shortcut opens form and submit adds a shortcut", async () => {
    await setup("add-shortcut");
    await testId(ctx.page, "launcher-settings-launch-add-shortcut-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    await testId(ctx.page, "launcher-settings-item-form-name-input").fill("Browse");
    await testId(ctx.page, "launcher-settings-item-form-text-input").fill("echo browse");
    await testId(ctx.page, "launcher-settings-item-form-scope-app").click();
    await testId(ctx.page, "launcher-settings-item-form-submit").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => a?.shortcuts?.map((s) => s.name).includes("Browse") ?? false,
      5000,
    );
    expect(app?.shortcuts?.map((s) => s.name)).toContain("Browse");
  });

  it("delete-profile removes profile from config", async () => {
    await setup("delete-profile");
    await testId(ctx.page, "launcher-settings-launch-profile-delete-button").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => !(a?.profiles?.map((p) => p.name).includes("Claude") ?? false),
      5000,
    );
    expect(app?.profiles?.map((p) => p.name)).not.toContain("Claude");
  });

  it("delete-shortcut removes shortcut from config", async () => {
    await setup("delete-shortcut");
    await testId(ctx.page, "launcher-settings-launch-shortcut-delete-button").click();
    const app = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      (a) => !(a?.shortcuts?.map((s) => s.name).includes("Editor") ?? false),
      5000,
    );
    expect(app?.shortcuts?.map((s) => s.name)).not.toContain("Editor");
  });

  it("edit-profile prefills name", async () => {
    await setup("edit-profile");
    await testId(ctx.page, "launcher-settings-launch-profile-edit-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("Claude");
  });

  it("edit-shortcut prefills name", async () => {
    await setup("edit-shortcut");
    await testId(ctx.page, "launcher-settings-launch-shortcut-edit-button").click();
    await waitVisible(ctx.page, "launcher-settings-item-form-name-input");
    expect(
      await ctx.page.inputValue('[data-testid="launcher-settings-item-form-name-input"]'),
    ).toBe("Editor");
  });
});
