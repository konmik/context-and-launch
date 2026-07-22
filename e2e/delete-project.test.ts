import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, setupE2E, readProjectRegistry,
  gotoProject, openLauncherSettings,
} from "./fixtures.js";

async function openDeleteViaSettings(page: import("playwright").Page): Promise<void> {
  await openLauncherSettings(page);
  await page.click('[data-testid="launcher-settings-tab-misc"]');
  const btn = page.locator('[data-testid="launcher-settings-delete-project"]');
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
}

async function deleteCurrentProject(page: import("playwright").Page): Promise<void> {
  await openDeleteViaSettings(page);
  const submit = page.locator('[data-testid="delete-project-submit"]');
  await submit.waitFor({ state: "visible", timeout: 10000 });
  await submit.click();
}

describe("Delete project (e2e, real server)", () => {
  const ctx = setupE2E();

  it("deleting the current project navigates away and removes it from dropdown and registry", async () => {
    const a = await createProject(ctx.testServer, { projectSlug: uniqueSlug("del-a") });
    const b = await createProject(ctx.testServer, { projectSlug: uniqueSlug("del-b") });
    ctx.projects.push(a, b);

    await ctx.page.goto(`${ctx.testServer.baseUrl}/`);
    await ctx.page.waitForURL("**/project/**", { timeout: 15000 });
    await ctx.page.waitForSelector('[data-testid="project-header-settings-button"]', {
      state: "visible",
      timeout: 15000,
    });
    await ctx.page.waitForURL(`**/project/${b.projectSlug}`, { timeout: 15000 });

    await deleteCurrentProject(ctx.page);

    await ctx.page.waitForURL(
      (url) => !url.pathname.includes(`/project/${b.projectSlug}`),
      { timeout: 15000 },
    );

    const registry = readProjectRegistry(ctx.testServer);
    expect(registry.projects.map((p) => p.projectSlug)).not.toContain(b.projectSlug);
    expect(registry.projects.map((p) => p.projectSlug)).toContain(a.projectSlug);
  }, 60000);

  it("cancelling the delete dialog keeps the project", async () => {
    const c = await createProject(ctx.testServer, { projectSlug: uniqueSlug("del-c") });
    ctx.projects.push(c);

    await gotoProject(ctx.page, ctx.testServer, c.projectSlug);
    await openDeleteViaSettings(ctx.page);

    const cancel = ctx.page.locator('[data-testid="delete-project-cancel"]');
    await cancel.waitFor({ state: "visible", timeout: 10000 });
    await cancel.click();

    await ctx.page.waitForSelector('[data-testid="delete-project-cancel"]', {
      state: "hidden", timeout: 10000,
    });
    expect(ctx.page.url()).toContain(`/project/${c.projectSlug}`);
    const registry = readProjectRegistry(ctx.testServer);
    expect(registry.projects.map((p) => p.projectSlug)).toContain(c.projectSlug);
  }, 60000);
});
