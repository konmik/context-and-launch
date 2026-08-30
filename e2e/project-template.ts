import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GlobalSetupContext } from "vitest/node";
import { removeTempDirOrWarn } from "../src/test-temp.js";

export interface ProjectTemplate {
  /** A repo with main and the tickets Orphan Branch, tracking remote. */
  repo: string;
  /** A bare remote holding main and the tickets Orphan Branch. */
  remote: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    projectTemplate: ProjectTemplate;
  }
}

function git(command: string, cwd: string): void {
  execSync(command, { cwd });
}

/**
 * Builds the Project template that e2e fixtures copy instead of running the git
 * ceremony per Project. Vitest runs this once before any worker starts, so the
 * fixtures need no cross-worker coordination, and the teardown removes the
 * template so no run inherits a stale one.
 */
export default async function setup({ provide }: GlobalSetupContext): Promise<() => void> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cl-e2e-template-"));
  const repo = path.join(base, "repo");
  const remote = path.join(base, "remote.git");
  const tickets = path.join(base, "tickets");

  fs.mkdirSync(repo, { recursive: true });
  git("git init -b main", repo);
  git("git config user.email test@test.com", repo);
  git("git config user.name Test", repo);
  git("git commit --allow-empty -m init", repo);
  git(`git init --bare -b tickets "${remote}"`, base);
  git(`git remote add origin "${remote}"`, repo);
  git("git push -u origin main", repo);
  git(`git worktree add --orphan -b tickets "${tickets}"`, repo);
  git("git commit --allow-empty -m init", tickets);
  git("git push -u origin tickets", tickets);
  // A copy must not inherit a worktree registration that points into the
  // template, so the template keeps the Orphan Branch and drops the worktree.
  git(`git worktree remove "${tickets}"`, repo);

  provide("projectTemplate", { repo, remote });

  return async () => {
    await removeTempDirOrWarn(base);
  };
}
