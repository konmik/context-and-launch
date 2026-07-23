import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickPort } from "./test-port.js";
import { startRealServer, stopRealServer, rmTemp, type RealServer } from "./real-server.js";

const PORT = pickPort();

let browser: Browser;
let page: Page;
let server: RealServer;
let dataDir: string;
let repoDir: string;

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Legacy config with 'slug' property names (sandboxed e2e)", () => {
  beforeAll(async () => {
    dataDir = tmpDir("cl-e2e-legacy-");
    repoDir = tmpDir("cl-e2e-repo-");
    execSync("git init", { cwd: repoDir });
    execSync("git config user.email test@test.com", { cwd: repoDir });
    execSync("git config user.name Test", { cwd: repoDir });
    execSync("git commit --allow-empty -m init", { cwd: repoDir });

    const configDir = path.join(dataDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        projects: [{ path: repoDir, slug: "legacy-proj", branch: "tickets" }],
        lastUsedSlug: "legacy-proj",
      }),
    );

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
    if (dataDir) await rmTemp(dataDir, "legacy-config dataDir");
    if (repoDir) await rmTemp(repoDir, "legacy-config repoDir");
  }, 20000);

  it("navigates past loading screen when config uses old 'slug' property names", async () => {
    await page.goto(server.baseUrl);
    await page.waitForSelector('button[title="Settings"]', {
      state: "visible",
      timeout: 15000,
    });
    expect(await page.locator("p").filter({ hasText: "Loading..." }).count()).toBe(0);
  }, 30000);

  it("migrates config file to use projectSlug property names", async () => {
    await page.goto(server.baseUrl);
    await page.waitForSelector('button[title="Settings"]', {
      state: "visible",
      timeout: 15000,
    });
    const config = JSON.parse(
      fs.readFileSync(path.join(dataDir, "config", "config.json"), "utf-8"),
    );
    expect(config.projects[0].projectSlug).toBe("legacy-proj");
    expect(config.projects[0].slug).toBeUndefined();
    expect(config.lastUsedProjectSlug).toBe("legacy-proj");
    expect(config.lastUsedSlug).toBeUndefined();
  }, 30000);
});
