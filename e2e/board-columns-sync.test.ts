import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { EMPTY_BOARD, DEFAULT_BOARDS } from "./setup-test-data.js";

const PORT = 4400 + Math.floor(Math.random() * 100);
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

const BOARD_COLUMNS: Record<string, string[]> = {
  kanban: ["todo", "prd", "in-progress", "review", "done"],
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
    await page.selectOption('[data-testid="board-id-select"]', "kanban");
    await page.waitForFunction(() => true);
    await closeSettings();
    await openSettings();
    const generalValue = await page.inputValue('[data-testid="board-id-select"]');
    await page.click('[data-testid="tab-columns"]');
    await page.waitForSelector('[data-testid="board-selector"]', { timeout: 3000 });
    const { value, names } = await readColumnsTabState();
    expect(generalValue).toBe("kanban");
    expect(value).toBe("kanban");
    expect(names).toEqual(BOARD_COLUMNS[value]);
  }, 15000);
});
