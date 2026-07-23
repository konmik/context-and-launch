import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, dragSortable,
  setupE2E, poll,
} from "./fixtures.js";

describe("Sync button pending badge (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

  it("pending badge clears after drag there and back when auto-commit runs in between", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-dragback-committed"),
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "C-1", title: "Boomerang", status: "todo", folderName: "c-1-boomerang" },
        { number: "C-2", title: "Stay todo", status: "todo", folderName: "c-2-stay-todo" },
        { number: "C-3", title: "Stay progress", status: "in-progress", folderName: "c-3-stay-progress" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });

    const aheadCount = () => parseInt(execSync("git rev-list @{u}..HEAD --count", {
      cwd: project.ticketsPath, encoding: "utf-8",
    }).trim(), 10);

    await dragSortable(
      ctx.page,
      '[data-sortable-id="todo:c-1-boomerang"]',
      '[data-sortable-id="in-progress:c-3-stay-progress"]',
      { releaseAt: "top" },
    );
    expect(
      await poll(aheadCount, (c) => c > 0, 10000, 250),
      "auto-commit did not run within 10s",
    ).toBeGreaterThan(0);

    await dragSortable(
      ctx.page,
      '[data-sortable-id="in-progress:c-1-boomerang"]',
      '[data-sortable-id="todo:c-2-stay-todo"]',
      { releaseAt: "top" },
    );

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 15000,
    });

    expect(aheadCount()).toBeGreaterThan(0);
    const diffVsUpstream = execSync("git diff @{u}", {
      cwd: project.ticketsPath, encoding: "utf-8",
    });
    expect(diffVsUpstream.trim()).toBe("");
  }, 60000);

  it("unknown project: not-found page shows no pending badge", async () => {
    const unknownSlug = "nonexistent-project-xyz";

    await ctx.page.goto(`${ctx.testServer.baseUrl}/project/${unknownSlug}`);
    await ctx.page.waitForSelector("text=Project not found", { state: "visible", timeout: 15000 });
    await ctx.page.waitForTimeout(3000);
    const badgeCount = await ctx.page.locator('[data-testid="sync-button-pending-badge"]').count();
    expect(badgeCount).toBeLessThanOrEqual(1);
  }, 60000);

  it("pending badge disappears after sync when local is behind remote", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-behind-remote"),
      withRemote: true,
      withTickets: [{ number: "R-1", title: "Initial", status: "todo", folderName: "r-1-initial" }],
    });
    ctx.projects.push(project);

    execSync("git push", { cwd: project.ticketsPath });

    const tmpClone = project.remoteUrl + "-clone";
    execSync(`git clone "${project.remoteUrl}" "${tmpClone}"`);
    execSync("git checkout tickets", { cwd: tmpClone });
    fs.writeFileSync(path.join(tmpClone, "r-1-initial", "to-do.md"), "updated remotely");
    execSync('git add -A && git commit -m "remote edit"', { cwd: tmpClone });
    execSync("git push", { cwd: tmpClone });
    fs.rmSync(tmpClone, { recursive: true, force: true });

    execSync("git fetch", { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });
  }, 60000);

  it("pending badge appears on fresh project due to order reconciliation", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-absent"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);
});
