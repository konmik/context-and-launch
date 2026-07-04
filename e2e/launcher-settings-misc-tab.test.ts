import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  openLauncherSettings, expectOpenConfigDirRequest,
  readProjectLauncherConfig, readProjectRegistry,
  setupE2E,
} from "./fixtures.js";

const APP_BOARDS = [
  { id: "kanban", name: "Kanban", columns: [{ name: "todo" }, { name: "done" }] },
  { id: "simple", name: "Simple", columns: [{ name: "todo" }, { name: "in-progress" }, { name: "done" }] },
];

describe("Launcher Settings Misc tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`lsg-${suffix}`),
      withBoards: APP_BOARDS,
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);
    await ctx.page.click('[data-testid="launcher-settings-tab-misc"]');
    return project;
  }

  it("opens settings panel and shows Misc tab", async () => {
    await setup("opens");
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-misc"]').count()).toBe(1);
  }, 60000);

  it("project name input persists on blur", async () => {
    const project = await setup("pname");
    const input = ctx.page.locator('[data-testid="launcher-settings-misc-project-name-input"]');
    await input.fill("Custom Name");
    await input.blur();
    await ctx.page.waitForTimeout(800);
    const registry = readProjectRegistry(ctx.testServer);
    const entry = registry.projects.find(
      (p: { projectSlug: string }) => p.projectSlug === project.projectSlug,
    );
    expect(entry?.name).toBe("Custom Name");
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

  it("launcher-settings-close-button hides the floating panel", async () => {
    await setup("close");
    await ctx.page.click('[data-testid="launcher-settings-close-button"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-tab-misc"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("launcher-settings-misc-worktree-input persists on Enter", async () => {
    const project = await setup("wt-input");
    await ctx.page.fill(
      '[data-testid="launcher-settings-misc-worktree-input"]',
      "/tmp/some-wt-path-for-test",
    );
    await ctx.page.locator('[data-testid="launcher-settings-misc-worktree-input"]').press("Enter");
    await ctx.page.waitForTimeout(800);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.worktreeRootPath).toBe("/tmp/some-wt-path-for-test");
  }, 60000);

  it("launcher-settings-misc-worktree-browse button exists", async () => {
    await setup("wt-browse");
    await ctx.page.waitForSelector('[data-testid="launcher-settings-misc-worktree-browse"]', {
      state: "visible", timeout: 10000,
    });
    expect(await ctx.page.locator('[data-testid="launcher-settings-misc-worktree-browse"]').count()).toBe(1);
  }, 60000);

  it("branch prefix input persists on blur", async () => {
    const project = await setup("bprefix");
    const input = ctx.page.locator(
      '[data-testid="launcher-settings-misc-branch-prefix-input"]',
    );
    await input.fill("feature/");
    await input.blur();
    await ctx.page.waitForTimeout(800);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.branchPrefix).toBe("feature/");
  }, 60000);

  it("launcher-settings-misc-conflict-prompt persists on blur", async () => {
    const project = await setup("cprompt");
    await ctx.page.fill(
      '[data-testid="launcher-settings-misc-conflict-prompt"]',
      "my custom prompt",
    );
    await ctx.page.locator('[data-testid="launcher-settings-misc-conflict-prompt"]').blur();
    await ctx.page.waitForTimeout(800);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.conflictResolutionPrompt).toBe("my custom prompt");
  }, 60000);
});
