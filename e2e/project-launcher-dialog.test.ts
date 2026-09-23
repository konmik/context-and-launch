import { describe, it, expect } from "vitest";
import {
  openProject, readProjectLauncherConfig, poll, setupE2E,
  openLauncherSettings, openLauncherSettingsTab, readAppLauncherConfig,
} from "./fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

const APP_LAUNCHER = {
  templates: [
    { name: "Default", text: "work in {{projectPath}}\n\n{{skills}}" },
    { name: "Other", text: "other {{projectPath}}" },
  ],
  profiles: [
    { name: "Claude", command: "echo claude" },
    { name: "GPT", command: "echo gpt" },
  ],
  skills: [
    { name: "alpha-skill", text: "a" },
  ],
};

const PROJECT_KEY = "__project__";

describe("Project launcher dialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await openProject(ctx, {
      slugBase: `pld-${suffix}`,
      appLauncherConfig: APP_LAUNCHER,
    });
    return project;
  }

  async function openDialog() {
    await testId(ctx.page, "project-header-title-menu-trigger").click();
    await testId(ctx.page, "project-header-launch-agent-menuitem").waitFor({
      state: "visible", timeout: 10000,
    });
    await testId(ctx.page, "project-header-launch-agent-menuitem").click();
    await waitVisible(ctx.page, "project-launcher-run-button");
  }

  it("title menu opens the project launcher dialog showing the project folder", async () => {
    const project = await setup("open");
    await openDialog();
    const display = testId(ctx.page, "project-launcher-dir-display");
    await display.waitFor({ state: "visible", timeout: 15000 });
    await ctx.page.waitForFunction(
      (expected) => {
        const el = document.querySelector('[data-testid="project-launcher-dir-display"]');
        return (el?.textContent ?? "").includes(expected);
      },
      project.projectPath,
      { timeout: 15000 },
    );
    expect(await display.textContent()).toContain(project.projectPath);
  });

  it("profile select persists to project launcher config under the project key", async () => {
    const project = await setup("profile");
    await openDialog();
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-profile-select"]', "GPT");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.[PROJECT_KEY]?.profileName === "GPT",
      5000,
    );
    expect(cfg?.columnDefaults?.[PROJECT_KEY]?.profileName).toBe("GPT");
  });

  it("run button triggers a server request and closes the dialog", async () => {
    await setup("run");
    await openDialog();
    const serverRequest = ctx.page.waitForRequest(req => req.url().includes("/_server"));
    await testId(ctx.page, "project-launcher-run-button").click();
    await serverRequest;
    await waitGone(ctx.page, "project-launcher-run-button");
    expect(await testId(ctx.page, "project-launcher-run-button").count()).toBe(0);
  });

  it("close button dismisses the dialog", async () => {
    await setup("close");
    await openDialog();
    await testId(ctx.page, "project-launcher-close-button").click();
    await waitGone(ctx.page, "project-launcher-run-button");
    expect(await testId(ctx.page, "project-launcher-run-button").count()).toBe(0);
  });

  it("shows a shared profile edit when reopening the launcher without a page reload", async () => {
    await setup('shared-profile');
    await openDialog();
    const select = testId(ctx.page, 'ticket-detail-launcher-profile-select');
    await select.locator('option[value="Claude"]').waitFor({ state: 'attached' });
    await testId(ctx.page, 'project-launcher-close-button').click();
    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, 'launch');
    const row = testId(ctx.page, 'launcher-settings-launch-profile-row', { 'data-item-name': 'Claude' });
    await testId(row, 'launcher-settings-launch-profile-edit-button').click();
    await testId(ctx.page, 'launcher-settings-item-form-name-input').fill('Renamed');
    await testId(ctx.page, 'launcher-settings-item-form-submit').click();
    await waitGone(ctx.page, 'launcher-settings-item-form-submit');
    await testId(ctx.page, 'launcher-settings-close-button').click();
    await openDialog();
    await select.locator('option[value="Renamed"]').waitFor({ state: 'attached' });
    expect(await select.locator('option[value="Claude"]').count()).toBe(0);
    expect(readAppLauncherConfig(ctx.testServer)?.profiles?.map(profile => profile.name)).toContain('Renamed');
  });
});
