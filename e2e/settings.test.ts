import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { EMPTY_BOARD } from "./setup-test-data.js";

const PORT = 4001 + Math.floor(Math.random() * 100);
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

describe("Settings panel (e2e)", () => {
  beforeAll(async () => {
    mockState = { boardData: structuredClone(EMPTY_BOARD) };
    server = await startMockServer(PORT, mockState);
    browser = await chromium.launch({ headless: true });
  }, 30000);

  beforeEach(async () => {
    mockState.boardData = structuredClone(EMPTY_BOARD);
    mockState.launcherConfig = {
      templates: [],
      skills: [],
      profiles: [],
      shortcuts: [],
      columnDefaults: {},
      worktreeRootPath: null,
    };
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await stopMockServer(server);
  }, 15000);

  it("opens settings panel when gear button is clicked", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    await page.click('button[title="Settings"]');

    const panel = await page.waitForSelector(
      '[data-scope="floating-panel"][data-part="content"]',
      { state: "visible", timeout: 3000 },
    );
    expect(panel).toBeTruthy();

    const title = await panel!.$('[data-scope="floating-panel"][data-part="title"]');
    const text = await title?.textContent();
    expect(text).toBe("Settings");
  }, 15000);

  it("keeps column edit dialog open when description PUT fails after rename", async () => {
    // Set up board with a column that has a description
    mockState.boards = [
      { id: "kanban", name: "Kanban", columns: [
        { name: "todo", description: "Tasks to do" },
        { name: "in-progress" },
        { name: "done" },
      ]},
    ];

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    // Open settings
    await page.click('button[title="Settings"]');
    await page.waitForSelector('[data-scope="floating-panel"][data-part="content"]', { state: "visible", timeout: 3000 });

    // Switch to columns tab
    await page.click('[data-scope="tabs"][data-part="trigger"][data-value="columns"]');
    await page.waitForSelector('[data-testid="column-row"]', { timeout: 3000 });

    // Click Edit on the "todo" column
    const todoRow = await page.waitForSelector('[data-testid="column-row"][data-column-name="todo"]', { timeout: 3000 });
    await todoRow!.waitForSelector('button:has-text("Edit")');
    await todoRow!.$eval('button:has-text("Edit")', (btn: HTMLButtonElement) => btn.click());

    // Column edit dialog should open
    const nameInput = await page.waitForSelector('[data-testid="column-name-input"]', { state: "visible", timeout: 3000 });
    expect(nameInput).toBeTruthy();

    // Change the name (triggers rename flow) and description
    await nameInput!.fill("backlog");
    const descInput = await page.waitForSelector('[data-testid="column-desc-input"]', { state: "visible", timeout: 3000 });
    await descInput!.fill("Updated description");

    // Click Save - should open rename dialog
    await page.click('[data-testid="column-form-submit"]');
    await page.waitForSelector('[data-testid="rename-scope-all"]', { state: "visible", timeout: 3000 });

    // Enable failColumnPut BEFORE clicking Rename - the description PUT will fail
    mockState.failColumnPut = true;

    // Click Rename (rename POST succeeds, description PUT fails)
    await page.click('button:has-text("Rename")');

    // The error message should be visible
    const errorEl = await page.waitForSelector('.text-destructive:has-text("description")', { state: "visible", timeout: 5000 });
    expect(errorEl).toBeTruthy();

    // The column edit dialog should still be open so the user can retry
    const descInputAfterError = await page.$('[data-testid="column-desc-input"]');
    expect(descInputAfterError).toBeTruthy();
    const descInputVisible = descInputAfterError ? await descInputAfterError.isVisible() : false;
    expect(descInputVisible).toBe(true);
  }, 30000);
});
