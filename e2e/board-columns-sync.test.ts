import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { EMPTY_BOARD, DEFAULT_BOARDS } from "./setup-test-data.js";
import { pickPort } from "./test-port.js";

const PORT = pickPort();
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

const BOARD_COLUMNS: Record<string, string[]> = {
  standard: ["todo", "plan", "in-progress", "review", "done"],
  simple: ["todo", "in-progress", "done"],
};

async function openSettings() {
  await page.click('button[title="Settings"]');
  await page.waitForSelector('[data-scope="floating-panel"][data-part="content"]', { state: "visible", timeout: 3000 });
}

async function openColumnsTab() {
  await openSettings();
  await page.click('[data-testid="tab-columns"]');
  await page.waitForSelector('[data-testid="board-selector"]', { timeout: 3000 });
}

async function closeSettings() {
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-scope="floating-panel"][data-part="content"]', { state: "hidden", timeout: 3000 });
}

async function readColumnsTabState() {
  const value = await page.inputValue('[data-testid="board-selector"]');
  const rows = await page.$$('[data-testid="column-row"]');
  const names = await Promise.all(rows.map(r => r.getAttribute("data-column-name")));
  return { value, names };
}

describe("Board/columns sync in settings (e2e)", () => {
  beforeAll(async () => {
    mockState = {
      boardData: structuredClone(EMPTY_BOARD),
      boards: structuredClone(DEFAULT_BOARDS),
      launcherConfig: {
        templates: [], skills: [], profiles: [], shortcuts: [],
        columnDefaults: {}, worktreeRootPath: null, boardId: "simple",
      },
    };
    server = await startMockServer(PORT, mockState);
    browser = await chromium.launch({ headless: true });
  }, 30000);

  beforeEach(async () => {
    mockState.boardData = structuredClone(EMPTY_BOARD);
    mockState.boards = structuredClone(DEFAULT_BOARDS);
    mockState.launcherConfig = {
      templates: [], skills: [], profiles: [], shortcuts: [],
      columnDefaults: {}, worktreeRootPath: null, boardId: "simple",
    };
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await stopMockServer(server);
  }, 15000);

  it("columns tab opens on the project's configured board", async () => {
    await openColumnsTab();
    const { value, names } = await readColumnsTabState();
    expect(value).toBe("simple");
    expect(names).toEqual(BOARD_COLUMNS.simple);
  }, 15000);

  it("board selector matches the columns shown beneath it", async () => {
    await openColumnsTab();
    const { value, names } = await readColumnsTabState();
    expect(names).toEqual(BOARD_COLUMNS[value]);
  }, 15000);

  it("board selector and columns stay in sync after closing and reopening", async () => {
    await openColumnsTab();
    await closeSettings();
    await openColumnsTab();
    const { value, names } = await readColumnsTabState();
    expect(value).toBe("simple");
    expect(names).toEqual(BOARD_COLUMNS[value]);
  }, 15000);

  it("General board and Columns board agree after reopening", async () => {
    await openSettings();
    await page.selectOption('[data-testid="board-id-select"]', "standard");
    await page.waitForSelector('[data-testid="set-project-board-confirm-btn"]', { timeout: 3000 });
    await page.click('[data-testid="set-project-board-confirm-btn"]');
    await page.waitForSelector('[data-testid="set-project-board-message"]', { state: "detached", timeout: 3000 });
    await closeSettings();
    await openSettings();
    const generalValue = await page.inputValue('[data-testid="board-id-select"]');
    await page.click('[data-testid="tab-columns"]');
    await page.waitForSelector('[data-testid="board-selector"]', { timeout: 3000 });
    const { value, names } = await readColumnsTabState();
    expect(generalValue).toBe("standard");
    expect(value).toBe("standard");
    expect(names).toEqual(BOARD_COLUMNS[value]);
  }, 15000);

  it("sets the selected board as the project board via the button and confirmation", async () => {
    await openColumnsTab();
    await page.waitForSelector('[data-testid="set-project-board-btn"]:disabled', { timeout: 3000 });
    await page.selectOption('[data-testid="board-selector"]', "standard");
    await page.waitForSelector('[data-testid="set-project-board-btn"]:not(:disabled)', { timeout: 3000 });
    await page.click('[data-testid="set-project-board-btn"]');
    const message = await page.waitForSelector('[data-testid="set-project-board-message"]', { timeout: 3000 });
    expect(await message!.textContent()).toContain("undefined column");
    await page.click('[data-testid="set-project-board-confirm-btn"]');
    await page.waitForSelector('[data-testid="set-project-board-btn"]:disabled', { timeout: 3000 });
    expect(mockState.launcherConfig?.boardId).toBe("standard");
  }, 15000);

  it("cancelling the set-project-board dialog leaves the project board unchanged", async () => {
    await openColumnsTab();
    await page.selectOption('[data-testid="board-selector"]', "standard");
    await page.click('[data-testid="set-project-board-btn"]');
    await page.waitForSelector('[data-testid="set-project-board-message"]', { timeout: 3000 });
    await page.click('[data-testid="set-project-board-cancel-btn"]');
    await page.waitForSelector('[data-testid="set-project-board-message"]', { state: "detached", timeout: 3000 });
    expect(mockState.launcherConfig?.boardId).toBe("simple");
  }, 15000);

  it("reloads the board's columns and tickets after closing settings", async () => {
    const initial = await page.locator("main h3").allTextContents();
    expect(initial.map(h => h.toLowerCase())).not.toContain("review");

    await openColumnsTab();

    // Simulate a column edit reaching the server while settings is open:
    // a new "review" column with a ticket parked in it.
    mockState.boardData.board!.columns.push({ name: "review" });
    mockState.boardData.board!.ticketOrder["review"] = ["t-9-review-me"];
    mockState.boardData.board!.tickets.push({
      number: "T-9", title: "Review Me", status: "review",
      folderName: "t-9-review-me", contextNames: [], useWorktree: false, fileNames: [], references: [],
    });

    await closeSettings();

    // Closing settings reloads the project, so the board reflects the new
    // column and ticket without a manual page reload.
    await page.waitForSelector('main h3:has-text("review")', { timeout: 3000 });
    const reloaded = await page.locator("main h3").allTextContents();
    expect(reloaded.map(h => h.toLowerCase())).toContain("review");
    await page.waitForSelector('[data-drag-source]:has-text("Review Me")', { timeout: 3000 });
    expect(await page.locator('[data-drag-source]:has-text("Review Me")').count()).toBe(1);
  }, 15000);
});
