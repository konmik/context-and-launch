import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject,
  setupE2E,
} from "./fixtures.js";

describe("Sync button diverged states (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

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
});
