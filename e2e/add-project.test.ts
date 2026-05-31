import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { type Browser, type Page } from "playwright";
import {
  createServer, launchBrowser, type TestServer, type TestBrowser,
  readProjectRegistry, readProjectLauncherConfig, getLocalStorageItem,
} from "./fixtures.js";

let testServer: TestServer;
let testBrowser: TestBrowser;
let browser: Browser;
let page: Page;
let repoDir: string;

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-addproj-repo-"));
  execSync("git init", { cwd: dir });
  execSync("git config user.email test@test.com", { cwd: dir });
  execSync("git config user.name Test", { cwd: dir });
  execSync("git commit --allow-empty -m init", { cwd: dir });
  return dir;
}

describe("Add project welcome screen (e2e, real server)", () => {
  beforeAll(async () => {
    testServer = await createServer();
    testBrowser = await launchBrowser();
    browser = testBrowser.browser;
    repoDir = makeRepo();
  }, 60000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await testBrowser?.stop();
    await testServer?.stop();
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }, 20000);

  it("theme-toggle-button toggles class and writes localStorage", async () => {
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="theme-toggle-button"]', { state: "visible", timeout: 10000 });
    const before = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await page.click('[data-testid="theme-toggle-button"]');
    await page.waitForFunction(
      (was) => document.documentElement.classList.contains("dark") !== was,
      before, { timeout: 3000 },
    );
    const theme = await getLocalStorageItem(page, "theme");
    expect(theme === "light" || theme === "dark").toBe(true);
  }, 60000);

  it("branch input defaults to tickets and is editable", async () => {
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="add-project-branch-input"]', { state: "visible", timeout: 10000 });
    const input = page.locator('[data-testid="add-project-branch-input"]');
    expect(await input.inputValue()).toBe("tickets");
    await input.fill("work-items");
    expect(await input.inputValue()).toBe("work-items");
  }, 60000);

  it("path Browse button is rendered", async () => {
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="add-project-path-browse"]', { state: "visible", timeout: 10000 });
    expect(await page.locator('[data-testid="add-project-path-browse"]').count()).toBe(1);
  }, 60000);

  it("tickets folder and worktree root Browse buttons are rendered", async () => {
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="add-project-tickets-browse"]', { state: "visible", timeout: 10000 });
    expect(await page.locator('[data-testid="add-project-tickets-browse"]').count()).toBe(1);
    expect(await page.locator('[data-testid="add-project-worktree-browse"]').count()).toBe(1);
  }, 60000);

  it("path input prefills tickets and worktree inputs", async () => {
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="add-project-path-input"]', { state: "visible", timeout: 10000 });
    await page.locator('[data-testid="add-project-path-input"]').fill(repoDir);
    await page.waitForFunction(
      () => {
        const t = (
          document.querySelector('[data-testid="add-project-tickets-root-input"]') as HTMLInputElement | null
        )?.value ?? "";
        const w = (
          document.querySelector('[data-testid="add-project-worktree-root-input"]') as HTMLInputElement | null
        )?.value ?? "";
        return t.length > 0 && w.length > 0;
      },
      { timeout: 10000 },
    );
    const t = await page.locator('[data-testid="add-project-tickets-root-input"]').inputValue();
    const w = await page.locator('[data-testid="add-project-worktree-root-input"]').inputValue();
    expect(t).toMatch(/tickets/);
    expect(w).toMatch(/worktrees/);
  }, 60000);

  it("submit registers the project on disk and creates the orphan branch", async () => {
    await page.goto(`${testServer.baseUrl}/add-project`);
    await page.waitForSelector('[data-testid="add-project-path-input"]', { state: "visible", timeout: 10000 });

    const customTickets = path.join(testServer.dataDir, "custom-tickets");
    const customWorktrees = path.join(testServer.dataDir, "custom-worktrees");

    await page.locator('[data-testid="add-project-path-input"]').fill(repoDir);
    await page.waitForFunction(() => {
      const t = (
        document.querySelector('[data-testid="add-project-tickets-root-input"]') as HTMLInputElement | null
      )?.value ?? "";
      return t.length > 0;
    }, { timeout: 15000 });
    await page.locator('[data-testid="add-project-tickets-root-input"]').fill(customTickets);
    await page.locator('[data-testid="add-project-worktree-root-input"]').fill(customWorktrees);
    await page.locator('[data-testid="add-project-branch-input"]').fill("work-items");
    await page.locator('[data-testid="add-project-submit"]').click();

    await page.waitForSelector('[data-testid="project-header-settings-button"]', {
      state: "visible", timeout: 15000,
    });

    const registry = readProjectRegistry(testServer);
    expect(registry.projects).toHaveLength(1);
    const projectSlug = registry.projects[0].projectSlug;
    expect(registry.projects[0].branch).toBe("work-items");
    expect(registry.projects[0].ticketsPath).toBe(customTickets);

    const launcher = readProjectLauncherConfig(testServer, projectSlug);
    expect(launcher?.worktreeRootPath).toBe(customWorktrees);

    expect(fs.existsSync(customWorktrees)).toBe(true);

    const orphan = execSync('git branch --list "work-items"', { cwd: repoDir, encoding: "utf-8" });
    expect(orphan).toContain("work-items");
  }, 60000);
});
