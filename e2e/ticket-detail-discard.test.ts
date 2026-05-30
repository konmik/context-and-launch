import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { createBoardWithTickets, type TicketInfo } from "./setup-test-data.js";
import { pickPort } from "./test-port.js";

const PORT = pickPort();
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

function makeTicket(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-1",
    title: "Test Ticket",
    status: "todo",
    folderName: "t-1-test-ticket",
    contextNames: ["to-do", "product-requirement-document"],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

async function openTicketDetail(p: Page) {
  await p.goto(`${BASE_URL}/project/e2e-test`);
  await p.waitForSelector("[data-drag-source]", { timeout: 10000 });
  await p.click("[data-drag-source]");
  await p.waitForSelector('button:has-text("to-do.md")', { timeout: 5000 });
}

describe("Ticket detail discard bugs (e2e)", () => {
  beforeAll(async () => {
    mockState = { boardData: createBoardWithTickets([]) };
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

  it("CRLF content from server does not trigger false dirty state on close", async () => {
    const ticket = makeTicket();
    mockState.boardData = createBoardWithTickets([ticket]);
    mockState.contextContents = {
      "to-do": "line one\r\nline two\r\n",
    };

    await openTicketDetail(page);
    await page.waitForTimeout(800);

    await page.click('button:has-text("Close")');
    await page.waitForTimeout(500);

    const discardDialogCount = await page.locator('text="Unsaved Changes"').count();
    expect(discardDialogCount).toBe(0);
  }, 30000);

  it("header X button with unsaved changes shows discard dialog instead of closing", async () => {
    const ticket = makeTicket();
    mockState.boardData = createBoardWithTickets([ticket]);
    mockState.contextContents = { "to-do": "original content" };

    await openTicketDetail(page);
    await page.waitForTimeout(500);

    const editor = page.locator(".cm-content");
    await editor.waitFor({ timeout: 3000 });
    await editor.click();
    await page.keyboard.type("extra text ");
    await page.waitForTimeout(200);

    const xButton = page.locator('[aria-label="Close Window"]');
    await xButton.click();
    await page.waitForTimeout(500);

    const panelVisible = await page.locator(
      '[data-scope="floating-panel"][data-part="content"][data-state="open"]',
    ).count();
    expect(panelVisible).toBe(1);

    const discardDialogCount = await page.locator('text="Unsaved Changes"').count();
    expect(discardDialogCount).toBeGreaterThan(0);
  }, 30000);

  it("discard dialog renders above the floating panel", async () => {
    const ticket = makeTicket();
    mockState.boardData = createBoardWithTickets([ticket]);
    mockState.contextContents = { "to-do": "original content" };

    await openTicketDetail(page);
    await page.waitForTimeout(500);

    const editor = page.locator(".cm-content");
    await editor.waitFor({ timeout: 3000 });
    await editor.click();
    await page.keyboard.type("extra text ");
    await page.waitForTimeout(200);

    await page.click('button:has-text("Close")');

    const backdrop = page.locator('[data-scope="dialog"][data-part="backdrop"]');
    await backdrop.waitFor({ state: "visible", timeout: 3000 });

    const panelPortalIdx = await page.evaluate(() => {
      const portalContainers = Array.from(document.body.children);
      const panelIdx = portalContainers.findIndex(
        (el) => el.querySelector('[data-scope="floating-panel"]') != null,
      );
      const dialogIdx = portalContainers.findIndex(
        (el) =>
          el.querySelector('[data-scope="dialog"][data-state="open"]') != null,
      );
      return { panelIdx, dialogIdx };
    });

    expect(panelPortalIdx.dialogIdx).toBeGreaterThan(panelPortalIdx.panelIdx);
  }, 30000);
});
