import { describe, it, expect } from "vitest";
import {
  expectOpenConfigDirRequest,
  readProjectLauncherConfig, readProjectRegistry, poll,
  setupE2E,
} from "./fixtures.js";
import { APP_BOARDS, openSettingsTab } from "./launcher-settings-shared.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Launcher Settings Misc tab (e2e, real server)", () => {
  const ctx = setupE2E();

  const setup = (suffix: string) => openSettingsTab(ctx, {
    slugBase: `lsg-${suffix}`,
    tab: "misc",
    withBoards: APP_BOARDS,
  });

  it("opens settings panel and shows Misc tab", async () => {
    await setup("opens");
    expect(await testId(ctx.page, "launcher-settings-tab-misc").count()).toBe(1);
  });

  it("project name input persists on blur", async () => {
    const project = await setup("pname");
    const input = testId(ctx.page, "launcher-settings-misc-project-name-input");
    await input.fill("Custom Name");
    await input.blur();
    const registry = await poll(
      () => readProjectRegistry(ctx.testServer),
      (r) => r.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === project.projectSlug,
      )?.name === "Custom Name",
      5000,
    );
    const entry = registry.projects.find(
      (p: { projectSlug: string }) => p.projectSlug === project.projectSlug,
    );
    expect(entry?.name).toBe("Custom Name");
  });

  it("launcher-settings-open-user-config fires open-config-dir request", async () => {
    await setup("open-user");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-user-config"]'));
  });

  it("launcher-settings-open-project-config fires open-config-dir request", async () => {
    await setup("open-proj");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-project-config"]'));
  });

  it("launcher-settings-close-button hides the floating panel", async () => {
    await setup("close");
    await testId(ctx.page, "launcher-settings-close-button").click();
    await waitGone(ctx.page, "launcher-settings-tab-misc");
  });

  it("launcher-settings-misc-worktree-input persists on Enter", async () => {
    const project = await setup("wt-input");
    await testId(ctx.page, "launcher-settings-misc-worktree-input").fill("/tmp/some-wt-path-for-test",
    );
    await testId(ctx.page, "launcher-settings-misc-worktree-input").press("Enter");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.worktreeRootPath === "/tmp/some-wt-path-for-test",
      5000,
    );
    expect(cfg?.worktreeRootPath).toBe("/tmp/some-wt-path-for-test");
  });

  it("launcher-settings-misc-worktree-browse button exists", async () => {
    await setup("wt-browse");
    await waitVisible(ctx.page, "launcher-settings-misc-worktree-browse");
    expect(await testId(ctx.page, "launcher-settings-misc-worktree-browse").count()).toBe(1);
  });

  it("branch prefix input persists on blur", async () => {
    const project = await setup("bprefix");
    const input = ctx.page.locator(
      '[data-testid="launcher-settings-misc-branch-prefix-input"]',
    );
    await input.fill("feature/");
    await input.blur();
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.branchPrefix === "feature/",
      5000,
    );
    expect(cfg?.branchPrefix).toBe("feature/");
  });

  it("launcher-settings-misc-conflict-prompt persists on blur", async () => {
    const project = await setup("cprompt");
    await testId(ctx.page, "launcher-settings-misc-conflict-prompt").fill("my custom prompt",
    );
    await testId(ctx.page, "launcher-settings-misc-conflict-prompt").blur();
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.conflictResolutionPrompt === "my custom prompt",
      5000,
    );
    expect(cfg?.conflictResolutionPrompt).toBe("my custom prompt");
  });
});
