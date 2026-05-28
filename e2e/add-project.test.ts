import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickPort } from "./test-port.js";
import { startRealServer, stopRealServer, type RealServer } from "./real-server.js";

const PORT = pickPort();

let browser: Browser;
let page: Page;
let server: RealServer;
let dataDir: string;
let repoDir: string;

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Add project welcome screen (sandboxed e2e)", () => {
  beforeAll(async () => {
    dataDir = tmpDir("cl-e2e-data-");
    repoDir = tmpDir("cl-e2e-repo-");
    execSync("git init", { cwd: repoDir });
    execSync("git config user.email test@test.com", { cwd: repoDir });
    execSync("git config user.name Test", { cwd: repoDir });
    execSync("git commit --allow-empty -m init", { cwd: repoDir });

    server = await startRealServer(PORT, dataDir);
    browser = await chromium.launch({ headless: true });
  }, 60000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await stopRealServer(server);
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }, 20000);

  it("shows a branch name field defaulting to tickets and lets the user edit it", async () => {
    await page.goto(`${server.baseUrl}/add-project`);
    const input = await page.waitForSelector("#project-branch", {
      state: "visible",
      timeout: 10000,
    });
    expect(await input.inputValue()).toBe("tickets");

    await input.fill("work-items");
    expect(await input.inputValue()).toBe("work-items");
  }, 30000);

  it("registers the project with the chosen branch and creates the worktree on it", async () => {
    await page.goto(`${server.baseUrl}/add-project`);
    await page.waitForSelector("#project-branch", { state: "visible", timeout: 10000 });

    await page.fill("#project-path", repoDir);
    await page.fill("#project-branch", "work-items");
    await page.click('button[type="submit"]');

    await page.waitForSelector('button[title="Settings"]', { state: "visible", timeout: 15000 });

    const config = JSON.parse(
      fs.readFileSync(path.join(dataDir, "config", "config.json"), "utf-8"),
    );
    expect(config.projects).toHaveLength(1);
    const slug: string = config.projects[0].slug;
    expect(config.projects[0].branch).toBe("work-items");

    const orphan = execSync('git branch --list "work-items"', {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(orphan.trim()).toContain("work-items");

    const worktreeDir = path.join(dataDir, "projects", slug, "tickets");
    const head = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: worktreeDir,
      encoding: "utf-8",
    }).trim();
    expect(head).toBe(`work-items--${slug}`);
  }, 45000);
});
