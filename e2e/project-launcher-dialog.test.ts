import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  readProjectLauncherConfig,
  setupE2E,
} from "./fixtures.js";

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
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`pld-${suffix}`),
      appLauncherConfig: APP_LAUNCHER,
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    return project;
  }

  async function openDialog() {
    await ctx.page.click('[data-testid="project-header-title-menu-trigger"]');
    await ctx.page.locator('[data-testid="project-header-launch-agent-menuitem"]').waitFor({
      state: "visible", timeout: 10000,
    });
    await ctx.page.click('[data-testid="project-header-launch-agent-menuitem"]');
    await ctx.page.waitForSelector('[data-testid="project-launcher-run-button"]', {
      state: "visible", timeout: 15000,
    });
  }

  it("title menu opens the project launcher dialog showing the project folder", async () => {
    const project = await setup("open");
    await openDialog();
    const display = ctx.page.locator('[data-testid="project-launcher-dir-display"]');
    await display.waitFor({ state: "visible", timeout: 15000 });
    expect(await display.textContent()).toContain(project.projectPath);
  }, 60000);

  it("profile select persists to project launcher config under the project key", async () => {
    const project = await setup("profile");
    await openDialog();
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-profile-select"]', "GPT");
    await ctx.page.waitForTimeout(500);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.columnDefaults?.[PROJECT_KEY]?.profileName).toBe("GPT");
  }, 60000);

  it("run button triggers a server request and closes the dialog", async () => {
    await setup("run");
    await openDialog();
    let serverRequest = false;
    ctx.page.on("request", (req) => {
      if (req.url().includes("/_server")) serverRequest = true;
    });
    await ctx.page.click('[data-testid="project-launcher-run-button"]');
    await ctx.page.waitForTimeout(2000);
    expect(serverRequest).toBe(true);
    expect(await ctx.page.locator('[data-testid="project-launcher-run-button"]').count()).toBe(0);
  }, 60000);

  it("close button dismisses the dialog", async () => {
    await setup("close");
    await openDialog();
    await ctx.page.click('[data-testid="project-launcher-close-button"]');
    await ctx.page.waitForSelector('[data-testid="project-launcher-run-button"]', {
      state: "detached", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="project-launcher-run-button"]').count()).toBe(0);
  }, 60000);
});
