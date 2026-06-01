import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, setupE2E, readProjectRegistry,
} from "./fixtures.js";

async function deleteCurrentProject(page: import("playwright").Page): Promise<void> {
  await page.click('[data-testid="project-header-project-dropdown-trigger"]');
  const item = page.locator('[data-testid="project-header-delete-project-menuitem"]');
  await item.waitFor({ state: "visible", timeout: 10000 });
  await item.click();
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
    await ctx.page.waitForSelector('[data-hydrated="true"]', { state: "attached", timeout: 15000 });
    await ctx.page.waitForURL(`**/project/${b.projectSlug}`, { timeout: 15000 });

    await deleteCurrentProject(ctx.page);

    await ctx.page.waitForURL(
      (url) => !url.pathname.includes(`/project/${b.projectSlug}`),
      { timeout: 15000 },
    );

    await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
    const items = ctx.page.locator('[data-testid="project-header-project-item"]');
    await items.first().waitFor({ state: "visible", timeout: 10000 });
    const slugs = await items.allInnerTexts();
    expect(slugs).not.toContain(b.projectSlug);
    expect(slugs).toContain(a.projectSlug);

    const registry = readProjectRegistry(ctx.testServer);
    expect(registry.projects.map((p) => p.projectSlug)).not.toContain(b.projectSlug);
  }, 60000);

  it("cancelling the delete dialog keeps the project", async () => {
    const c = await createProject(ctx.testServer, { projectSlug: uniqueSlug("del-c") });
    ctx.projects.push(c);

    await ctx.page.goto(`${ctx.testServer.baseUrl}/project/${c.projectSlug}`);
    await ctx.page.waitForSelector('[data-hydrated="true"]', { state: "attached", timeout: 15000 });

    await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
    const item = ctx.page.locator('[data-testid="project-header-delete-project-menuitem"]');
    await item.waitFor({ state: "visible", timeout: 10000 });
    await item.click();
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
