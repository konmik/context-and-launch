import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { createBoardWithTickets, type ColumnDefinition, type TicketInfo } from "./setup-test-data.js";

const PORT = 4030 + Math.floor(Math.random() * 100);
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

const columnsWithDesc: ColumnDefinition[] = [
  { name: "todo", description: "Work to do" },
  { name: "done" },
];

const TICKETS: TicketInfo[] = [
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha", stageNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-2", title: "Bravo", status: "done", folderName: "t-2-bravo", stageNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-3", title: "Orphan", status: "deleted-column", folderName: "t-3-orphan", stageNames: [], useWorktree: false, fileNames: [], references: [] },
];

describe("Column descriptions and undefined column (e2e)", () => {
  beforeAll(async () => {
    mockState = { boardData: createBoardWithTickets(TICKETS, columnsWithDesc) };
    server = await startMockServer(PORT, mockState);
    browser = await chromium.launch({ headless: true });
  }, 30000);

  beforeEach(async () => {
    mockState.boardData = createBoardWithTickets(TICKETS, columnsWithDesc);
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await stopMockServer(server);
  }, 15000);

  it("renders column descriptions below column headers", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
    const desc = await page.waitForSelector('[data-testid="column-description"]', { timeout: 3000 });
    expect(desc).toBeTruthy();
    const text = await desc!.textContent();
    expect(text).toBe("Work to do");
  }, 15000);

  it("shows undefined column for orphaned tickets", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
    const undefinedCol = await page.waitForSelector('[data-testid="undefined-column"]', { timeout: 3000 });
    expect(undefinedCol).toBeTruthy();
    const header = await undefinedCol!.$("h3");
    const headerText = await header?.textContent();
    expect(headerText?.trim()).toBe("undefined");
  }, 15000);

  it("undefined column shows orphaned status in red on ticket cards", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
    const orphanedStatus = await page.waitForSelector('[data-testid="orphaned-status"]', { timeout: 3000 });
    expect(orphanedStatus).toBeTruthy();
    const text = await orphanedStatus!.textContent();
    expect(text).toBe("deleted-column");
  }, 15000);

  it("undefined column shows an Update manually description", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
    const desc = await page.waitForSelector('[data-testid="undefined-column-description"]', { timeout: 3000 });
    const text = await desc!.textContent();
    expect(text).toBe("Update manually");
  }, 15000);

  it("undefined column has red border styling", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
    const undefinedCol = await page.waitForSelector('[data-testid="undefined-column"]', { timeout: 3000 });
    const classes = await undefinedCol!.getAttribute("class");
    expect(classes).toContain("border-destructive");
  }, 15000);

  it("undefined column disappears when no orphaned tickets", async () => {
    // Use data with no orphaned tickets
    const ticketsNoOrphan: TicketInfo[] = [
      { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha", stageNames: [], useWorktree: false, fileNames: [], references: [] },
    ];
    mockState.boardData = createBoardWithTickets(ticketsNoOrphan, columnsWithDesc);
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");
    const undefinedCol = await page.$('[data-testid="undefined-column"]');
    expect(undefinedCol).toBeNull();
  }, 15000);
});
