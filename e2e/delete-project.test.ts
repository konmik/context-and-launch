import { describe, it, expect } from "vitest";
import {
  openProject, seedProject, openLauncherSettings,
  setupE2E, readProjectRegistry,
} from "./fixtures.js";
import { testId, waitVisible, waitHidden } from "./locators.js";

async function openDeleteViaSettings(page: import("playwright").Page): Promise<void> {
  await openLauncherSettings(page);
  await testId(page, "launcher-settings-tab-misc").click();
  const btn = testId(page, "launcher-settings-delete-project");
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
}

async function deleteCurrentProject(page: import("playwright").Page): Promise<void> {
  await openDeleteViaSettings(page);
  const submit = testId(page, "delete-project-submit");
  await submit.waitFor({ state: "visible", timeout: 10000 });
  await submit.click();
}

describe("Delete project (e2e, real server)", () => {
  const ctx = setupE2E();

  it("deleting the current project navigates away and removes it from dropdown and registry", async () => {
    const a = await seedProject(ctx, { slugBase: "del-a" });
    const b = await seedProject(ctx, { slugBase: "del-b" });
    ctx.projects.push(a, b);

    await ctx.page.goto(`${ctx.testServer.baseUrl}/`);
    await ctx.page.waitForURL("**/project/**", { timeout: 15000 });
    await waitVisible(ctx.page, "project-header-settings-button");
    await ctx.page.waitForURL(`**/project/${b.projectSlug}`, { timeout: 15000 });

    await deleteCurrentProject(ctx.page);

    await ctx.page.waitForURL(
      (url) => !url.pathname.includes(`/project/${b.projectSlug}`),
      { timeout: 15000 },
    );

    const registry = readProjectRegistry(ctx.testServer);
    expect(registry.projects.map((p) => p.projectSlug)).not.toContain(b.projectSlug);
    expect(registry.projects.map((p) => p.projectSlug)).toContain(a.projectSlug);
  });

  it("cancelling the delete dialog keeps the project", async () => {
    const c = await openProject(ctx, { slugBase: "del-c" });
    await openDeleteViaSettings(ctx.page);

    const cancel = testId(ctx.page, "delete-project-cancel");
    await cancel.waitFor({ state: "visible", timeout: 10000 });
    await cancel.click();

    await waitHidden(ctx.page, "delete-project-cancel");
    expect(ctx.page.url()).toContain(`/project/${c.projectSlug}`);
    const registry = readProjectRegistry(ctx.testServer);
    expect(registry.projects.map((p) => p.projectSlug)).toContain(c.projectSlug);
  });
});
