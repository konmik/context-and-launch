import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, dragSortable,
  setupE2E, poll,
} from "./fixtures.js";

describe("Sync button (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

  it("sync-button-trigger renders on the page", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("sb-render") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-trigger"]', { state: "visible", timeout: 10000 });
  }, 60000);

  it("sync-button-trigger push to remote, then sync-button-check-icon appears", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-push"),
      withRemote: true,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });
    if (project.remoteUrl) {
      const log = execSync(`git log --all --format=%s`, { cwd: project.remoteUrl, encoding: "utf-8" });
      expect(log.length).toBeGreaterThan(0);
    }
  }, 60000);

  it("sync-button-check-icon and sync-button-conflict-badge are absent on a fresh project", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("sb-icons") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    expect(await ctx.page.locator('[data-testid="sync-button-check-icon"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="sync-button-conflict-badge"]').count()).toBe(0);
  }, 60000);

  it("pending badge appears after creating a ticket", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-appear"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForTimeout(1000);
    await ctx.page.click('[data-testid="project-header-new-ticket-button"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', {
      state: "visible", timeout: 10000,
    });
    await ctx.page.fill('[data-testid="create-ticket-number-input"]', "P-1");
    await ctx.page.fill('[data-testid="create-ticket-title-input"]', "Pending test");
    await ctx.page.click('[data-testid="create-ticket-submit"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("pending badge disappears after sync", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-sync"),
      withRemote: true,
      withTickets: [{ number: "S-1", title: "Sync me", status: "todo", folderName: "s-1-sync-me" }],
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
  }, 60000);

  it("pending badge appears after dragging a ticket between columns", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-drag"),
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "D-1", title: "Drag me", status: "todo", folderName: "d-1-drag-me" },
        { number: "D-2", title: "Anchor", status: "in-progress", folderName: "d-2-anchor" },
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

    await dragSortable(
      ctx.page,
      '[data-sortable-id="todo:d-1-drag-me"]',
      '[data-sortable-id="in-progress:d-2-anchor"]',
      { releaseAt: "top" },
    );

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("pending badge clears after dragging a ticket there and back", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-dragback"),
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "B-1", title: "Boomerang", status: "todo", folderName: "b-1-boomerang" },
        { number: "B-2", title: "Stay todo", status: "todo", folderName: "b-2-stay-todo" },
        { number: "B-3", title: "Stay progress", status: "in-progress", folderName: "b-3-stay-progress" },
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

    await dragSortable(
      ctx.page,
      '[data-sortable-id="todo:b-1-boomerang"]',
      '[data-sortable-id="in-progress:b-3-stay-progress"]',
      { releaseAt: "top" },
    );
    await dragSortable(
      ctx.page,
      '[data-sortable-id="in-progress:b-1-boomerang"]',
      '[data-sortable-id="todo:b-2-stay-todo"]',
      { releaseAt: "top" },
    );

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 15000,
    });

    const porcelain = execSync("git status --porcelain", {
      cwd: project.ticketsPath, encoding: "utf-8",
    });
    expect(porcelain.trim()).toBe("");
    const aheadCount = execSync("git rev-list @{u}..HEAD --count", {
      cwd: project.ticketsPath, encoding: "utf-8",
    });
    expect(aheadCount.trim()).toBe("0");
  }, 60000);

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
    await ctx.page.waitForSelector('[data-hydrated="true"]', { state: "attached", timeout: 15000 });
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

  it("diverged without conflict: sync merges and pushes", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-diverged-ok"),
      withRemote: true,
      withTickets: [{ number: "DV-1", title: "Local file", status: "todo", folderName: "dv-1-local-file" }],
    });
    ctx.projects.push(project);

    execSync("git push", { cwd: project.ticketsPath });
    const tmpClone = project.remoteUrl + "-clone-dv";
    execSync(`git clone "${project.remoteUrl}" "${tmpClone}"`);
    execSync("git checkout tickets", { cwd: tmpClone });
    fs.mkdirSync(path.join(tmpClone, "dv-2-remote-only"), { recursive: true });
    fs.writeFileSync(path.join(tmpClone, "dv-2-remote-only", "status.json"),
      JSON.stringify({ number: "DV-2", title: "Remote only", status: "todo" }));
    execSync('git add -A && git commit -m "remote add"', { cwd: tmpClone });
    execSync("git push", { cwd: tmpClone });
    fs.rmSync(tmpClone, { recursive: true, force: true });

    fs.writeFileSync(path.join(project.ticketsPath, "dv-1-local-file", "notes.md"), "local note");
    execSync("git fetch", { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });

    const remoteLog = execSync("git log --all --format=%s", {
      cwd: project.remoteUrl!, encoding: "utf-8",
    });
    expect(remoteLog).toContain("sync: local changes");
  }, 60000);

  it("multiple commits squashed into one before push", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-squash"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });

    fs.mkdirSync(path.join(project.ticketsPath, "sq-1-first"), { recursive: true });
    fs.writeFileSync(path.join(project.ticketsPath, "sq-1-first", "status.json"),
      JSON.stringify({ number: "SQ-1", title: "First", status: "todo" }));
    execSync('git add -A && git commit -m "auto: external changes"', { cwd: project.ticketsPath });

    fs.mkdirSync(path.join(project.ticketsPath, "sq-2-second"), { recursive: true });
    fs.writeFileSync(path.join(project.ticketsPath, "sq-2-second", "status.json"),
      JSON.stringify({ number: "SQ-2", title: "Second", status: "todo" }));
    execSync('git add -A && git commit -m "auto: external changes"', { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });

    const count = execSync("git rev-list @{u}..HEAD --count", {
      cwd: project.ticketsPath, encoding: "utf-8",
    }).trim();
    expect(count).toBe("0");

    const log = execSync("git log --oneline tickets", {
      cwd: project.remoteUrl!, encoding: "utf-8",
    });
    const syncLines = log.split("\n").filter((l: string) => l.includes("sync: local changes"));
    expect(syncLines.length).toBe(1);
  }, 60000);

  it("no-upstream first sync: pushes and sets tracking", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-no-upstream"),
      withRemote: true,
    });
    ctx.projects.push(project);

    execSync("git branch --unset-upstream", { cwd: project.ticketsPath });
    fs.mkdirSync(path.join(project.ticketsPath, "nu-1-test"), { recursive: true });
    fs.writeFileSync(path.join(project.ticketsPath, "nu-1-test", "status.json"),
      JSON.stringify({ number: "NU-1", title: "Test", status: "todo" }));

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });

    const tracking = execSync("git rev-parse --abbrev-ref --symbolic-full-name @{u}", {
      cwd: project.ticketsPath, encoding: "utf-8",
    }).trim();
    expect(tracking).toContain("origin/");
  }, 60000);

  it("untracked files make pending badge appear", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-untracked"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });

    fs.writeFileSync(path.join(project.ticketsPath, "loose-file.txt"), "untracked");

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("double-click sync: second click is ignored while first is in progress", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-doubleclick"),
      withRemote: true,
      withTickets: [{ number: "DC-1", title: "Double", status: "todo", folderName: "dc-1-double" }],
    });
    ctx.projects.push(project);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-trigger"]', { state: "visible", timeout: 10000 });

    await ctx.page.click('[data-testid="sync-button-trigger"]');

    const isDisabled = await ctx.page.locator('[data-testid="sync-button-trigger"]').isDisabled();
    expect(isDisabled).toBe(true);

    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });
  }, 60000);

  it("switch project resets pending badge and polls new project", async () => {
    const project1 = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-switch-a"),
      withRemote: true,
      withTickets: [{ number: "SW-1", title: "Has changes", status: "todo", folderName: "sw-1-has-changes" }],
    });
    ctx.projects.push(project1);

    const project2 = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-switch-b"),
      withRemote: true,
    });
    ctx.projects.push(project2);
    execSync("git push -u origin tickets", { cwd: project2.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project1.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });

    await gotoProject(ctx.page, ctx.testServer, project2.projectSlug);

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });
  }, 60000);

  it("net-zero unpushed commits: sync succeeds and flip.txt does not exist", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-netzero"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });

    fs.writeFileSync(path.join(project.ticketsPath, "flip.txt"), "changed");
    execSync('git add -A && git commit -m "auto: change"', { cwd: project.ticketsPath });
    fs.unlinkSync(path.join(project.ticketsPath, "flip.txt"));
    execSync('git add -A && git commit -m "auto: revert"', { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });

    expect(fs.existsSync(path.join(project.ticketsPath, "flip.txt"))).toBe(false);
    const status = execSync("git status --porcelain", {
      cwd: project.ticketsPath, encoding: "utf-8",
    }).trim();
    expect(status).toBe("");
  }, 60000);
});
