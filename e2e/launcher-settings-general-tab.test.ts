import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  openLauncherSettings, expectOpenConfigDirRequest,
  readProjectLauncherConfig,
  setupE2E,
} from "./fixtures.js";

const APP_BOARDS = [
  { id: "kanban", name: "Kanban", columns: [{ name: "todo" }, { name: "done" }] },
  { id: "simple", name: "Simple", columns: [{ name: "todo" }, { name: "in-progress" }, { name: "done" }] },
];

describe("Launcher Settings General tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`lsg-${suffix}`),
      withBoards: APP_BOARDS,
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);
    return project;
  }

  it("opens settings panel and shows General tab by default", async () => {
    await setup("opens");
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-general"]').count()).toBe(1);
  }, 60000);

  it("launcher-settings-open-user-config fires open-config-dir request", async () => {
    await setup("open-user");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-user-config"]'));
  }, 60000);

  it("launcher-settings-open-project-config fires open-config-dir request", async () => {
    await setup("open-proj");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-project-config"]'));
  }, 60000);

  it("launcher-settings-open-worktrees-dir fires open-config-dir request", async () => {
    await setup("open-wt");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-worktrees-dir"]'));
  }, 60000);

  it("launcher-settings-close-button hides the floating panel", async () => {
    await setup("close");
    await ctx.page.click('[data-testid="launcher-settings-close-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-tab-general"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("launcher-settings-general-worktree-input persists on Enter", async () => {
    const project = await setup("wt-input");
    await ctx.page.fill(
      '[data-testid="launcher-settings-general-worktree-input"]',
      "/tmp/some-wt-path-for-test",
    );
    await ctx.page.locator('[data-testid="launcher-settings-general-worktree-input"]').press("Enter");
    await ctx.page.waitForTimeout(800);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.worktreeRootPath).toBe("/tmp/some-wt-path-for-test");
  }, 60000);

  it("launcher-settings-general-worktree-browse button exists", async () => {
    await setup("wt-browse");
    expect(await ctx.page.locator('[data-testid="launcher-settings-general-worktree-browse"]').count()).toBe(1);
  }, 60000);

  it("launcher-settings-general-conflict-prompt persists on blur", async () => {
    const project = await setup("cprompt");
    await ctx.page.fill(
      '[data-testid="launcher-settings-general-conflict-prompt"]',
      "my custom prompt",
    );
    await ctx.page.locator('[data-testid="launcher-settings-general-conflict-prompt"]').blur();
    await ctx.page.waitForTimeout(800);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.conflictResolutionPrompt).toBe("my custom prompt");
  }, 60000);
});
