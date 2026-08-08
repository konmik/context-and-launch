import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  gotoProject, seedProject,
  setupE2E,
} from "./fixtures.js";
import {
  aheadCount, commitAll, fetchTickets, git, mutateRemote, porcelainStatus,
  pushTickets, remoteBranchLog, remoteSubjects, upstreamBranch,
} from "./git-fixtures.js";
import { testId, waitVisible } from "./locators.js";

function writeTicketFolder(root: string, folderName: string, status: object): void {
  fs.mkdirSync(path.join(root, folderName), { recursive: true });
  fs.writeFileSync(path.join(root, folderName, "status.json"), JSON.stringify(status));
}

describe("Sync button push behavior (e2e, real server)", () => {
  const ctx = setupE2E();

  async function syncAndWaitForSuccess(): Promise<void> {
    await testId(ctx.page, "sync-button-trigger").click();
    await waitVisible(ctx.page, "sync-button-check-icon");
  }

  it("diverged without conflict: sync merges and pushes", async () => {
    const project = await seedProject(ctx, {
      slugBase: "sb-diverged-ok",
      withRemote: true,
      withTickets: [{ number: "DV-1", title: "Local file", status: "todo", folderName: "dv-1-local-file" }],
    });

    pushTickets(project);
    mutateRemote(project, {
      message: "remote add",
      edit: (clone) => writeTicketFolder(clone, "dv-2-remote-only", {
        number: "DV-2", title: "Remote only", status: "todo",
      }),
    });

    fs.writeFileSync(path.join(project.ticketsPath, "dv-1-local-file", "notes.md"), "local note");
    fetchTickets(project);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await syncAndWaitForSuccess();

    expect(remoteSubjects(project)).toContain("sync: local changes");
  });

  it("multiple commits squashed into one before push", async () => {
    const project = await seedProject(ctx, { slugBase: "sb-squash", withRemote: true });
    pushTickets(project);

    writeTicketFolder(project.ticketsPath, "sq-1-first", {
      number: "SQ-1", title: "First", status: "todo",
    });
    commitAll(project.ticketsPath, "auto: external changes");

    writeTicketFolder(project.ticketsPath, "sq-2-second", {
      number: "SQ-2", title: "Second", status: "todo",
    });
    commitAll(project.ticketsPath, "auto: external changes");

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await syncAndWaitForSuccess();

    expect(aheadCount(project.ticketsPath)).toBe(0);

    const syncLines = remoteBranchLog(project).split("\n")
      .filter((line) => line.includes("sync: local changes"));
    expect(syncLines.length).toBe(1);
  });

  it("no-upstream first sync: pushes and sets tracking", async () => {
    const project = await seedProject(ctx, { slugBase: "sb-no-upstream", withRemote: true });

    git("branch --unset-upstream", project.ticketsPath);
    writeTicketFolder(project.ticketsPath, "nu-1-test", {
      number: "NU-1", title: "Test", status: "todo",
    });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await syncAndWaitForSuccess();

    expect(upstreamBranch(project.ticketsPath)).toContain("origin/");
  });

  it("net-zero unpushed commits: sync succeeds and flip.txt does not exist", async () => {
    const project = await seedProject(ctx, { slugBase: "sb-netzero", withRemote: true });
    pushTickets(project);

    fs.writeFileSync(path.join(project.ticketsPath, "flip.txt"), "changed");
    commitAll(project.ticketsPath, "auto: change");
    fs.unlinkSync(path.join(project.ticketsPath, "flip.txt"));
    commitAll(project.ticketsPath, "auto: revert");

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await syncAndWaitForSuccess();

    expect(fs.existsSync(path.join(project.ticketsPath, "flip.txt"))).toBe(false);
    expect(porcelainStatus(project.ticketsPath)).toBe("");
  });
});
