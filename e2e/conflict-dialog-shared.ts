import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { commitAll, fetchTickets, git, mutateRemote, type TicketsWorktree } from "./git-fixtures.js";
import type { SeedAppLauncherConfig } from "./fixtures.js";

/** The conflict dialog needs a profile to offer, so every conflict test seeds one. */
export const CONFLICT_LAUNCHER: SeedAppLauncherConfig = {
  profiles: [{ name: "Claude", command: "echo claude" }],
};

// Reproduce the state after a user launches conflict resolution: a scratch
// worktree (sibling of the live tickets folder) with a rebase in progress.
// The live tickets folder is left clean on its last good commit.
export function createActiveRebaseConflict(project: TicketsWorktree): void {
  const { ticketsPath } = project;
  fs.writeFileSync(path.join(ticketsPath, "conflict.txt"), "local\n");
  commitAll(ticketsPath, "local-change");

  mutateRemote(project, {
    message: "remote-change",
    edit: (clone) => fs.writeFileSync(path.join(clone, "conflict.txt"), "remote\n"),
  });

  fetchTickets(project);
  const scratch = `${ticketsPath}-conflict-resolve`;
  git(`worktree add --detach "${scratch}" HEAD`, ticketsPath);
  let rebaseFailed = false;
  let rebaseOutput = "";
  try {
    execSync("git rebase origin/tickets", { cwd: scratch, stdio: "pipe" });
  } catch (error) {
    rebaseFailed = true;
    const failure = error as { stdout?: Buffer; stderr?: Buffer };
    rebaseOutput = [failure.stdout, failure.stderr]
      .map((stream) => (stream ? stream.toString() : ""))
      .join("");
  }
  if (!rebaseFailed) throw new Error("expected rebase to leave a conflict");
  try {
    execSync("git rev-parse --verify REBASE_HEAD", { cwd: scratch, stdio: "pipe" });
  } catch {
    throw new Error(
      `expected a rebase in progress in ${scratch}, but git left none.`
      + ` git rebase output was:\n${rebaseOutput}`,
    );
  }
}
