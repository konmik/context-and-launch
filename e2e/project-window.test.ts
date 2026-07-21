import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, setupE2E, readProjectRegistry, gotoProject, poll,
} from "./fixtures.js";

describe("Project window (e2e, real server)", () => {
  const ctx = setupE2E();

  it("watchers stay live across windows: an external change to a backgrounded project still commits", async () => {
    const a = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("pw-live-a"), withRemote: true,
    });
    const b = await createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-live-b") });
    ctx.projects.push(a, b);

    await gotoProject(ctx.page, ctx.testServer, a.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });

    const page2 = await ctx.newPage();
    await gotoProject(page2, ctx.testServer, b.projectSlug);

    // Project B loaded last. On the old single-window model B's load stopped A's
    // watcher, so this external change to A would never auto-commit and A's
    // sync-pending cache would never invalidate. With additive watching A's
    // watcher stays live: the change commits and A's page picks up the pending
    // badge on its next poll.
    fs.writeFileSync(path.join(a.ticketsPath, "external-note.md"), "external change");

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible",
      timeout: 20000,
    });

    const lastSubject = await poll(
      () => execSync("git log -1 --format=%s", { cwd: a.ticketsPath, encoding: "utf-8" }).trim(),
      (s) => s === "auto: external changes",
      20000,
    );
    expect(lastSubject).toBe("auto: external changes");
  }, 90000);

  it("focusing a window makes its project the last-used", async () => {
    const f = await createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-focus-f") });
    const g = await createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-focus-g") });
    ctx.projects.push(f, g);

    await gotoProject(ctx.page, ctx.testServer, f.projectSlug);
    const page2 = await ctx.newPage();
    await gotoProject(page2, ctx.testServer, g.projectSlug);

    const afterLoad = await poll(
      () => readProjectRegistry(ctx.testServer).lastUsedProjectSlug,
      (v) => v === g.projectSlug,
      10000,
    );
    expect(afterLoad).toBe(g.projectSlug);

    await ctx.page.bringToFront();
    await ctx.page.evaluate(() => window.dispatchEvent(new Event("focus")));

    const afterFocus = await poll(
      () => readProjectRegistry(ctx.testServer).lastUsedProjectSlug,
      (v) => v === f.projectSlug,
      10000,
    );
    expect(afterFocus).toBe(f.projectSlug);
  }, 90000);

  it("the open-in-new-window button opens a titled popup and reuses the named target", async () => {
    const c = await createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-open-c") });
    const d = await createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-open-d") });
    ctx.projects.push(c, d);

    await gotoProject(ctx.page, ctx.testServer, c.projectSlug);
    expect(await ctx.page.title()).toContain(c.projectSlug);

    const openRowButton = async () => {
      await ctx.page.bringToFront();
      if (await ctx.page.locator('[data-testid="project-header-project-item"]').first().isVisible()) {
        await ctx.page.keyboard.press("Escape");
        await ctx.page.locator('[data-testid="project-header-project-item"]').first().waitFor({
          state: "hidden", timeout: 5000,
        });
      }
      await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
      const row = ctx.page.locator('[data-testid="project-header-project-item"]', {
        hasText: d.projectSlug,
      });
      await row.waitFor({ state: "visible", timeout: 10000 });
      const button = row.locator('[data-testid="project-header-open-window-button"]');
      await button.waitFor({ state: "visible", timeout: 10000 });
      return button;
    };

    const [popup] = await Promise.all([
      ctx.page.waitForEvent("popup"),
      (await openRowButton()).click({ force: true }),
    ]);
    await popup.waitForLoadState();
    expect(popup.url().endsWith(`/project/${d.projectSlug}`)).toBe(true);
    await popup.waitForSelector('[data-testid="project-header-settings-button"]', {
      state: "visible", timeout: 15000,
    });
    expect(await popup.title()).toContain(d.projectSlug);
    expect(ctx.page.url()).toContain(`/project/${c.projectSlug}`);

    const pagesBefore = ctx.page.context().pages().length;
    await (await openRowButton()).click({ force: true });
    await ctx.page.waitForTimeout(1000);
    expect(ctx.page.context().pages().length).toBe(pagesBefore);
    expect(popup.url().endsWith(`/project/${d.projectSlug}`)).toBe(true);

    await popup.close();
  }, 90000);

  it("the open-in-new-window button is disabled for an unavailable project", async () => {
    const e = await createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-open-e") });
    ctx.projects.push(e);

    const configFile = path.join(ctx.testServer.dataDir, "config", "config.json");
    const registry = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    registry.projects.push({
      path: path.join(ctx.testServer.reposParentDir, "missing-gone"),
      projectSlug: "gone-x",
      branch: "tickets",
    });
    fs.writeFileSync(configFile, JSON.stringify(registry, null, 2));

    await gotoProject(ctx.page, ctx.testServer, e.projectSlug);
    await ctx.page.click('[data-testid="project-header-project-dropdown-trigger"]');
    const goneRow = ctx.page.locator('[data-testid="project-header-project-item"]', {
      hasText: "gone-x",
    });
    await goneRow.waitFor({ state: "visible", timeout: 10000 });
    const disabled = await goneRow
      .locator('[data-testid="project-header-open-window-button"]')
      .isDisabled();
    expect(disabled).toBe(true);
  }, 90000);
});
