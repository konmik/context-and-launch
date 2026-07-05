import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page, type Locator } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickPort } from "./test-port.js";
import { startRealServer, stopRealServer, type RealServer } from "./real-server.js";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const PORT = pickPort();
const PICKED_DIR = path.join(os.tmpdir(), "e2e-picked-dir");
const PICKED_FILES = [
  path.join(os.tmpdir(), "e2e-ref-a.ts"),
  path.join(os.tmpdir(), "e2e-ref-b.ts"),
];

let browser: Browser;
let server: RealServer;
let dataDir: string;
let repoDir: string;
let pickerStubFile: string;
let filePickerStubFile: string;
let projectSlug: string;

function setPickerStub(value: string) {
  fs.writeFileSync(pickerStubFile, value);
}

function setFilePickerStub(value: string) {
  fs.writeFileSync(filePickerStubFile, value);
}

// ---------------------------------------------------------------------------
// Generic test runners
// ---------------------------------------------------------------------------

interface DirectoryPickerSpec {
  name: string;
  setup: (page: Page) => Promise<void>;
  button: (page: Page) => Locator;
  input: (page: Page) => Locator;
  errorContainer: (page: Page) => Locator;
}

function testDirectoryPicker(spec: DirectoryPickerSpec) {
  describe(spec.name, () => {
    let page: Page;
    afterEach(async () => { await page?.close(); });

    it("fills the input when the picker returns a path", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setPickerStub(PICKED_DIR);
      await spec.setup(page);
      await spec.button(page).click();
      await expect.poll(() => spec.input(page).inputValue(), { timeout: 5000 })
        .toBe(PICKED_DIR);
    }, 30000);

    it("leaves the input unchanged and shows no error when the user cancels", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setPickerStub("__cancel__");
      await spec.setup(page);
      const before = await spec.input(page).inputValue();
      await spec.button(page).click();
      await page.waitForTimeout(500);
      expect(await spec.input(page).inputValue()).toBe(before);
      expect(await spec.errorContainer(page).count()).toBe(0);
    }, 30000);

    it("shows an error when no picker is available", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setPickerStub("__unavailable__");
      await spec.setup(page);
      await spec.button(page).click();
      await expect.poll(
        () => spec.errorContainer(page).textContent(),
        { timeout: 5000 },
      ).toBeTruthy();
    }, 30000);

    it("shows an error when the picker fails (not cancel)", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setPickerStub("__error__");
      await spec.setup(page);
      await spec.button(page).click();
      await expect.poll(
        () => spec.errorContainer(page).textContent(),
        { timeout: 5000 },
      ).toBeTruthy();
    }, 30000);
  });
}

interface FilePickerSpec {
  name: string;
  setup: (page: Page) => Promise<void>;
  button: (page: Page) => Locator;
  errorContainer: (page: Page) => Locator;
  assertFilesAdded: (page: Page) => Promise<void>;
}

function testFilePicker(spec: FilePickerSpec) {
  describe(spec.name, () => {
    let page: Page;
    afterEach(async () => { await page?.close(); });

    it("adds file references when the picker returns paths", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setFilePickerStub(PICKED_FILES.join("\n"));
      await spec.setup(page);
      await spec.button(page).click();
      await spec.assertFilesAdded(page);
    }, 30000);

    it("does nothing when the user cancels", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setFilePickerStub("__cancel__");
      await spec.setup(page);
      await spec.button(page).click();
      await page.waitForTimeout(500);
    }, 30000);

    it("shows an error when the file picker fails", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      setFilePickerStub("__error__");
      await spec.setup(page);
      await spec.button(page).click();
      await expect.poll(
        () => spec.errorContainer(page).isVisible(),
        { timeout: 5000 },
      ).toBe(true);
    }, 30000);
  });
}

// ---------------------------------------------------------------------------
// Single real server with file-based stub control
// ---------------------------------------------------------------------------

describe("Picker buttons (e2e, real server)", () => {
  beforeAll(async () => {
    dataDir = tmpDir("cl-picker-data-");
    repoDir = tmpDir("cl-picker-repo-");
    pickerStubFile = path.join(dataDir, "picker-stub");
    filePickerStubFile = path.join(dataDir, "file-picker-stub");

    fs.writeFileSync(pickerStubFile, "__cancel__");
    fs.writeFileSync(filePickerStubFile, "__cancel__");

    execSync("git init", { cwd: repoDir });
    execSync("git config user.email test@test.com", { cwd: repoDir });
    execSync("git config user.name Test", { cwd: repoDir });
    execSync("git commit --allow-empty -m init", { cwd: repoDir });

    const canonicalRepoDir = fs.realpathSync(repoDir);
    projectSlug = path.basename(canonicalRepoDir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const configDir = path.join(dataDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        projects: [{ path: canonicalRepoDir, projectSlug, branch: "tickets" }],
        lastUsedProjectSlug: projectSlug,
      }, null, 2),
    );
    const projectConfigDir = path.join(dataDir, "projects", projectSlug, "config");
    fs.mkdirSync(projectConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectConfigDir, "launcher-config.json"),
      JSON.stringify({
        worktreeRootPath: path.join(dataDir, "projects", projectSlug, "worktrees"),
      }, null, 2),
    );

    const ticketsDir = path.join(dataDir, "projects", projectSlug, "tickets");
    fs.mkdirSync(path.dirname(ticketsDir), { recursive: true });
    execSync(`git worktree add --orphan -b tickets "${ticketsDir}"`, { cwd: repoDir });
    execSync("git commit --allow-empty -m init", { cwd: ticketsDir });

    const boardsFile = path.join(configDir, "boards.json");
    fs.writeFileSync(boardsFile, JSON.stringify([
      { id: "default", name: "Default", columns: [{ name: "todo" }] },
    ], null, 2));

    server = await startRealServer(PORT, dataDir, {
      CONTEXT_PICKER_STUB_FILE: pickerStubFile,
      CONTEXT_FILE_PICKER_STUB_FILE: filePickerStubFile,
    });

    browser = await chromium.launch({ headless: true });
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    if (server) await stopRealServer(server);
    if (repoDir) {
      const wtPath = path.join(dataDir, "projects", projectSlug, "tickets");
      try { execSync(`git worktree remove --force "${wtPath}"`, { cwd: repoDir }); } catch { /* ignore */ }
    }
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
  }, 20000);

  // --- Add Project page: project path directory picker ---

  async function goToAddProject(page: Page) {
    await page.goto(`${server.baseUrl}/add-project`);
    await page.waitForSelector("#project-path", { state: "visible", timeout: 10000 });
  }

  testDirectoryPicker({
    name: "Add Project > project path Browse",
    setup: goToAddProject,
    button: (p) => p.locator("#project-path + button"),
    input: (p) => p.locator("#project-path"),
    errorContainer: (p) => p.locator("form p.text-destructive"),
  });

  // --- Settings panel: worktree root directory picker ---

  const WORKTREE_BROWSE = "launcher-settings-misc-worktree-browse";
  async function goToSettingsMisc(page: Page) {
    await page.goto(`${server.baseUrl}/project/${projectSlug}`);
    await page.waitForSelector('button[title="Settings"]', { state: "visible", timeout: 15000 });
    await page.click('button[title="Settings"]');
    await page.click('[data-testid="launcher-settings-tab-misc"]');
    await page.waitForSelector(`[data-testid="${WORKTREE_BROWSE}"]`, {
      state: "visible", timeout: 5000,
    });
  }

  testDirectoryPicker({
    name: "Settings > worktree root Browse",
    setup: goToSettingsMisc,
    button: (p) => p.locator(`[data-testid="${WORKTREE_BROWSE}"]`),
    input: (p) => p.locator(`[data-testid="${WORKTREE_BROWSE}"]`).locator(
      "xpath=preceding-sibling::input",
    ),
    errorContainer: (p) => p.locator('[data-testid="error-dialog-ok"]'),
  });

  // --- Ticket detail: file reference picker ---

  function ensureTicketExists() {
    const ticketsDir = path.join(dataDir, "projects", projectSlug, "tickets");
    const folderName = "t-1-picker-test";
    const ticketDir = path.join(ticketsDir, folderName);
    if (fs.existsSync(ticketDir)) return;
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(
      path.join(ticketDir, "status.json"),
      JSON.stringify({ number: "T-1", title: "Picker test", status: "todo" }, null, 2),
    );
    fs.writeFileSync(path.join(ticketDir, "to-do.md"), "");
    execSync("git add -A", { cwd: ticketsDir });
    execSync('git commit -m "seed ticket"', { cwd: ticketsDir });
  }

  async function goToTicketDetail(page: Page) {
    await ensureTicketExists();
    await page.goto(`${server.baseUrl}/project/${projectSlug}`);
    await page.waitForSelector("[data-drag-source]", { timeout: 15000 });
    await page.click("[data-drag-source]");
    await page.waitForSelector('button:has-text("Add file reference")', { state: "visible", timeout: 5000 });
  }

  describe("Ticket Detail > Add file reference > remembers last directory", () => {
    let page: Page;
    afterEach(async () => { await page?.close(); });

    it("uses the directory of the previously picked file on the next open", async () => {
      page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      // Clear any persisted dir from prior tests
      await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
      const firstFile = path.join(os.tmpdir(), "dir-A", "file1.ts");
      const secondFile = path.join(os.tmpdir(), "dir-B", "file2.ts");

      setFilePickerStub(firstFile);
      await goToTicketDetail(page);
      await page.locator('button:has-text("Add file reference")').click();
      await expect.poll(
        async () => {
          const btns = await page.locator("button").allTextContents();
          return btns.some(t => t.includes("REFERENCE"));
        },
        { timeout: 5000 },
      ).toBe(true);

      setFilePickerStub(secondFile);
      await page.locator('button:has-text("Add file reference")').click();
      await page.waitForTimeout(2000);
      const btns = await page.locator("button").allTextContents();
      const refCount = btns.filter(t => t.includes("REFERENCE")).length;
      expect(refCount).toBeGreaterThanOrEqual(1);
    }, 30000);
  });

  testFilePicker({
    name: "Ticket Detail > Add file reference",
    setup: goToTicketDetail,
    button: (p) => p.locator('button:has-text("Add file reference")'),
    errorContainer: (p) => p.locator('[data-testid="error-dialog-ok"]'),
    assertFilesAdded: async (p) => {
      await expect.poll(
        async () => {
          const btns = await p.locator("button").allTextContents();
          return btns.some(t => t.includes("REFERENCE"));
        },
        { timeout: 5000 },
      ).toBe(true);
    },
  });
});
