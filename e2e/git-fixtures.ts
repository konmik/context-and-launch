import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The Orphan Branch every fixture Project stores its tickets on. */
export const TICKETS_BRANCH = "tickets";

export function git(command: string, cwd: string): string {
  return execSync(`git ${command}`, { cwd, encoding: "utf-8" }).trim();
}

/**
 * The suite's setup file puts user.name and user.email in the environment, so a
 * repo made here needs no per-repo identity.
 */
export function initGitRepo(repoPath: string, branch = "main"): void {
  git(`init -b ${branch}`, repoPath);
  git("commit --allow-empty -m init", repoPath);
}

export function createScratchRepo(prefix: string, branch = "main"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  initGitRepo(dir, branch);
  return dir;
}

export function commitAll(cwd: string, message: string): void {
  git("add -A", cwd);
  git(`commit -m "${message}"`, cwd);
}

/**
 * Branch names only. git marks the current branch with "*" and a branch checked
 * out in another worktree with "+", so both markers come off.
 */
export function gitBranches(repoPath: string): string[] {
  return git("branch --list", repoPath)
    .split("\n").map((line) => line.replace(/^[\s*+]+/, "").trim()).filter(Boolean);
}

export function branchExists(repoPath: string, branch: string): boolean {
  try {
    execSync(`git rev-parse --verify refs/heads/${branch}`, { cwd: repoPath, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface TicketsWorktree {
  ticketsPath: string;
  remoteUrl: string | null;
}

export function pushTickets(project: TicketsWorktree): void {
  git(`push -u origin ${TICKETS_BRANCH}`, project.ticketsPath);
}

export function fetchTickets(project: TicketsWorktree): void {
  git("fetch", project.ticketsPath);
}

/** Commits ahead of the tracked upstream. */
export function aheadCount(cwd: string): number {
  return parseInt(git("rev-list @{u}..HEAD --count", cwd), 10);
}

export function porcelainStatus(cwd: string): string {
  return git("status --porcelain", cwd);
}

/** Files whose committed content differs from upstream, ignoring how many commits carry them. */
export function upstreamDiff(cwd: string): string {
  return git("diff @{u}..HEAD --name-only", cwd);
}

function requireRemote(project: TicketsWorktree): string {
  if (!project.remoteUrl) throw new Error("this fixture Project has no remote");
  return project.remoteUrl;
}

/** Runs git log inside the Project's remote, e.g. remoteLog(p, "--all --format=%s"). */
export function remoteLog(project: TicketsWorktree, args: string): string {
  return git(`log ${args}`, requireRemote(project));
}

export interface MutateRemoteOptions {
  /** Branch to check out in the throwaway clone. */
  branch?: string;
  message: string;
  /** Applies the change inside the clone's working tree. */
  edit: (cloneDir: string) => void;
}

/**
 * Plays the part of a second machine pushing to the Project's remote: clones it,
 * applies one commit and pushes, then drops the clone. Tests need this because a
 * remote that only ever receives the app's own pushes can never diverge.
 */
export function mutateRemote(project: TicketsWorktree, options: MutateRemoteOptions): void {
  const remoteUrl = requireRemote(project);
  const branch = options.branch ?? TICKETS_BRANCH;
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-e2e-remote-clone-"));
  try {
    execSync(`git clone --branch ${branch} "${remoteUrl}" "${cloneDir}"`);
    options.edit(cloneDir);
    commitAll(cloneDir, options.message);
    git("push", cloneDir);
  } finally {
    // git can still hold handles inside the clone just after pushing, and a
    // leftover temp directory matters far less than failing the caller's test.
    try {
      fs.rmSync(cloneDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`mutateRemote: could not remove ${cloneDir}:`, err);
    }
  }
}
