import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function createTestDataDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-stages-e2e-"));

  const projectPath = path.join(tmpDir, "test-project");
  fs.mkdirSync(projectPath, { recursive: true });
  execSync("git init", { cwd: projectPath, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: projectPath, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: projectPath, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: projectPath, stdio: "ignore" });

  const slug = "e2e-test";

  fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({
    projects: [{ path: projectPath, slug }],
    lastUsedSlug: slug,
  }));

  const boardConfigDir = path.join(tmpDir, "board-config");
  fs.mkdirSync(boardConfigDir, { recursive: true });
  fs.writeFileSync(path.join(boardConfigDir, "kanban.json"), JSON.stringify({
    columns: ["todo", "in-progress", "done"],
  }));

  return tmpDir;
}

export async function seedTickets(dataDir: string) {
  const { TicketStore } = await import("../src/server/ticket-store.js");
  const { WorktreeManager } = await import("../src/server/worktree-manager.js");

  const slug = "e2e-test";
  const projects = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf-8")).projects;
  const projectPath = projects[0].path;

  const wm = new WorktreeManager(dataDir);
  const worktreeDir = await wm.ensureWorktree(projectPath, slug);

  const store = new TicketStore(worktreeDir);
  store.createTicket("T-1", "Alpha", "todo");
  store.createTicket("T-2", "Bravo", "todo");
  store.createTicket("T-3", "Charlie", "in-progress");
  store.createTicket("T-4", "Delta", "in-progress");
}

export function cleanupTestDataDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}
