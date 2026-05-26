import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import {
  SEEDED_BOARD,
  createBoardWithTickets,
  type TicketInfo,
} from "./setup-test-data.js";

const PORT = 4001 + Math.floor(Math.random() * 100);
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

const TICKETS: TicketInfo[] = [
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha", stageNames: [], useWorktree: false, fileNames: [], references: [] },
];

describe("Sync button (e2e)", () => {
  beforeAll(async () => {
    mockState = { boardData: structuredClone(createBoardWithTickets(TICKETS, undefined, false)) };
    server = await startMockServer(PORT, mockState);
    browser = await chromium.launch({ headless: true });
  }, 30000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await stopMockServer(server);
  }, 15000);

  it("sync button shows error when clicked without remote tracking branch", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, false));

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    expect(await page.locator('[data-testid="sync-button"]').count()).toBe(1);
    await page.locator('[data-testid="sync-button"]').click();
    await page.waitForSelector('text=No remote tracking branch configured', { timeout: 5000 });
  }, 15000);

  it("sync button is visible when remote tracking branch exists", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, true));

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    expect(await page.locator('[data-testid="sync-button"]').count()).toBe(1);
  }, 15000);

  it("sync button shows conflict badge on page load when rebase is active", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, true, true));

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    expect(await page.locator('[data-testid="sync-conflict-badge"]').count()).toBe(1);
  }, 15000);

  it("sync button shows check icon after successful sync", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, true));
    mockState.onSync = () => ({ status: "success" });

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    await page.locator('[data-testid="sync-button"]').click();

    // Check icon should appear
    await page.waitForSelector('[data-testid="sync-check"]', { timeout: 5000 });
    expect(await page.locator('[data-testid="sync-check"]').count()).toBe(1);
  }, 15000);

  it("conflict dialog appears on conflict and abort dismisses it", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, true));
    mockState.onSync = () => ({ status: "conflict" });
    mockState.onSyncAbort = () => ({ success: true });

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    await page.locator('[data-testid="sync-button"]').click();

    // Wait for conflict dialog
    await page.waitForSelector('text=Sync Conflicts Detected', { timeout: 5000 });

    // Click Abort
    await page.click('button:has-text("Abort")');

    // Dialog should close
    await page.waitForFunction(() => !document.querySelector('text=Sync Conflicts Detected'), { timeout: 5000 }).catch(() => {});
    // Small delay for dialog animation
    await page.waitForTimeout(500);
    expect(await page.locator('text=Sync Conflicts Detected').count()).toBe(0);
  }, 15000);

  it("conflict dialog cannot be dismissed via backdrop click", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, true));
    mockState.onSync = () => ({ status: "conflict" });

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    // Click sync to trigger conflict
    await page.locator('[data-testid="sync-button"]').click();
    await page.waitForSelector('text=Sync Conflicts Detected', { timeout: 5000 });

    await page.locator('[data-scope="dialog"][data-part="backdrop"]').click({ position: { x: 10, y: 10 }, force: true });
    await page.waitForTimeout(500);

    // After the fix: dialog should STILL be open (backdrop click is blocked)
    const dialogStillOpen = await page.locator('text=Sync Conflicts Detected').count();
    expect(dialogStillOpen).toBe(1);
  }, 15000);

  it("launch button picks profile and launches resolver", async () => {
    mockState.boardData = structuredClone(createBoardWithTickets(TICKETS, undefined, true));
    mockState.launcherConfig = { templates: [], skills: [], profiles: [{ name: "Claude Win", command: "cmd /c claude", scope: "app" }], shortcuts: [], columnDefaults: {}, worktreeRootPath: null };
    mockState.onSync = () => ({ status: "conflict" });
    let resolveCalled = false;
    mockState.onResolveConflicts = () => { resolveCalled = true; return { success: true }; };

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    await page.locator('[data-testid="sync-button"]').click();
    await page.waitForSelector('text=Sync Conflicts Detected', { timeout: 5000 });

    // Profile dropdown should have the profile selected
    await page.waitForSelector('[data-testid="conflict-profile-select"]', { timeout: 5000 });

    await page.click('button:has-text("Launch")');

    // Dialog should close after launch
    await page.waitForTimeout(1000);
    expect(await page.locator('text=Sync Conflicts Detected').count()).toBe(0);
    expect(resolveCalled).toBe(true);
  }, 15000);
});
