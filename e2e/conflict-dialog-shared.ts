import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Reproduce the state after a user launches conflict resolution: a scratch
// worktree (sibling of the live tickets folder) with a rebase in progress.
// The live tickets folder is left clean on its last good commit.
export function createActiveRebaseConflict(ticketsPath: string, remoteUrl: string | null | undefined): void {
  fs.writeFileSync(path.join(ticketsPath, "conflict.txt"), "local\n");
  execSync("git add -A", { cwd: ticketsPath });
  execSync("git commit -m local-change", { cwd: ticketsPath });

  if (!remoteUrl) throw new Error("expected remoteUrl");
  const tmpClone = fs.mkdtempSync(path.join(os.tmpdir(), "cl-conflict-remote-"));
  try {
    execSync(`git clone -b tickets "${remoteUrl}" "${tmpClone}"`);
    execSync("git config user.email test@test.com", { cwd: tmpClone });
    execSync("git config user.name Test", { cwd: tmpClone });
    fs.writeFileSync(path.join(tmpClone, "conflict.txt"), "remote\n");
    execSync("git add -A", { cwd: tmpClone });
    execSync("git commit -m remote-change", { cwd: tmpClone });
    execSync("git push origin tickets", { cwd: tmpClone });
  } finally {
    fs.rmSync(tmpClone, { recursive: true, force: true });
  }

  execSync("git fetch", { cwd: ticketsPath });
  const scratch = `${ticketsPath}-conflict-resolve`;
  execSync(`git worktree add --detach "${scratch}" HEAD`, { cwd: ticketsPath });
  let rebaseFailed = false;
  try {
    execSync("git rebase origin/tickets", { cwd: scratch, stdio: "pipe" });
  } catch {
    rebaseFailed = true;
  }
  if (!rebaseFailed) throw new Error("expected rebase to leave a conflict");
}
