import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, dragSortable,
  setupE2E, poll,
} from "./fixtures.js";

describe("Sync button pending states II (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

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

  it("no-remote: sync shows error dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-no-remote"),
      withRemote: false,
      withTickets: [{ number: "NR-1", title: "Local only", status: "todo", folderName: "nr-1-local-only" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-trigger"]', { state: "visible", timeout: 10000 });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector("text=No remote", { state: "visible", timeout: 10000 });
  }, 60000);

  it("in-sync: sync succeeds with nothing to do", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-in-sync"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });

    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });
  }, 60000);

  it("diverged with conflict: conflict badge remains after reloading", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-conflict"),
      withRemote: true,
      withTickets: [{ number: "CF-1", title: "Conflict", status: "todo", folderName: "cf-1-conflict" }],
    });
    ctx.projects.push(project);

    execSync("git push", { cwd: project.ticketsPath });
    const tmpClone = project.remoteUrl + "-clone-cf";
    execSync(`git clone "${project.remoteUrl}" "${tmpClone}"`);
    execSync("git checkout tickets", { cwd: tmpClone });
    fs.writeFileSync(path.join(tmpClone, "cf-1-conflict", "status.json"),
      JSON.stringify({ number: "CF-1", title: "Conflict", status: "done" }));
    execSync('git add -A && git commit -m "remote conflict"', { cwd: tmpClone });
    execSync("git push", { cwd: tmpClone });
    fs.rmSync(tmpClone, { recursive: true, force: true });

    fs.writeFileSync(path.join(project.ticketsPath, "cf-1-conflict", "status.json"),
      JSON.stringify({ number: "CF-1", title: "Conflict", status: "in-progress" }));

    execSync("git fetch", { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-close"]', {
      state: "visible", timeout: 20000,
    });
    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-conflict-badge"]', {
      state: "visible", timeout: 5000,
    });
    expect(await ctx.page.locator('[data-testid="sync-button-pending-badge"]').count()).toBe(0);
  }, 60000);
});
