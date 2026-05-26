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
});
