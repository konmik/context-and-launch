import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import {
  EMPTY_BOARD,
  SEEDED_BOARD,
  createBoardWithTickets,
  type TicketInfo,
  type BoardPageData,
} from "./setup-test-data.js";
import { pickPort } from "./test-port.js";

const PORT = pickPort();
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

describe("Board CRUD (e2e)", () => {
  beforeAll(async () => {
    mockState = { boardData: structuredClone(EMPTY_BOARD) };
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

  it("shows columns with no tickets", async () => {
    mockState.boardData = structuredClone(EMPTY_BOARD);

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    const headers = await page.locator("h3").allTextContents();
    const lower = headers.map((h) => h.toLowerCase());
    expect(lower).toContain("todo");
    expect(lower).toContain("in-progress");
    expect(lower).toContain("done");

    expect(await page.locator("[data-drag-source]").count()).toBe(0);
  }, 15000);

  it("creates a ticket", async () => {
    // Start with empty board; when create is called, update board data and respond with success
    const board = structuredClone(EMPTY_BOARD);
    mockState.boardData = board;
    mockState.onCreateTicket = (slug, number, title) => {
      const newTicket: TicketInfo = {
        number,
        title,
        status: "todo",
        folderName: `${number.toLowerCase()}-${title.toLowerCase().replace(/\s+/g, "-")}`,
        contextNames: [],
        useWorktree: false,
        fileNames: [],
        references: [],
      };
      board.board!.tickets.push(newTicket);
      board.board!.ticketOrder["todo"].push(newTicket.folderName);
      return { success: true };
    };

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    await page.click('button:has-text("New Ticket")');
    await page.waitForSelector("#ticket-number");
    await page.fill("#ticket-number", "E2E-1");
    await page.fill("#ticket-title", "First Ticket");
    await page.click('button[type="submit"]');

    await page.waitForSelector("[data-drag-source]", { timeout: 5000 });
    expect(await page.locator("[data-drag-source]").count()).toBe(1);
    const text = await page.locator("[data-drag-source]").textContent();
    expect(text).toContain("E2E-1");
    expect(text).toContain("First Ticket");
  }, 15000);

  it("edits a ticket", async () => {
    const board = structuredClone(SEEDED_BOARD);
    mockState.boardData = board;
    mockState.onUpdateTicket = (_slug, folderName, number, title, _status) => {
      const ticket = board.board!.tickets.find((t) => t.folderName === folderName);
      if (ticket) {
        if (title !== null) ticket.title = title;
        if (number !== null) ticket.number = number;
      }
      return { success: true };
    };

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-drag-source]", { timeout: 5000 });

    await page.evaluate(() => (document.querySelector('button[aria-label="Ticket actions"]') as HTMLElement)?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="menuitem"]');
      for (const item of items) { if (item.textContent?.trim() === "Edit") { (item as HTMLElement).click(); break; } }
    });
    await page.waitForSelector("#edit-title");
    await page.fill("#edit-title", "Edited Ticket");
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);
    const text = await page.locator("[data-drag-source]").first().textContent();
    expect(text).toContain("Edited Ticket");
  }, 15000);

  it("archive action opens archive dialog, not ticket detail", async () => {
    mockState.boardData = structuredClone(SEEDED_BOARD);

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-drag-source]", { timeout: 5000 });

    await page.evaluate(() => (document.querySelector('button[aria-label="Ticket actions"]') as HTMLElement)?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="menuitem"]');
      for (const item of items) { if (item.textContent?.trim() === "Archive") { (item as HTMLElement).click(); break; } }
    });

    await page.waitForSelector('[data-part="title"]:has-text("Archive Ticket")');
    expect(await page.locator('[data-part="title"]:has-text("Archive Ticket")').isVisible()).toBe(true);
  }, 15000);

  it("deletes a ticket", async () => {
    const board = structuredClone(SEEDED_BOARD);
    mockState.boardData = board;
    mockState.onDeleteTicket = (_slug, folderName) => {
      const idx = board.board!.tickets.findIndex((t) => t.folderName === folderName);
      if (idx >= 0) {
        const ticket = board.board!.tickets[idx];
        board.board!.tickets.splice(idx, 1);
        const orderArr = board.board!.ticketOrder[ticket.status];
        const orderIdx = orderArr.indexOf(folderName);
        if (orderIdx >= 0) orderArr.splice(orderIdx, 1);
      }
      return { success: true };
    };

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-drag-source]");

    const countBefore = await page.locator("[data-drag-source]").count();
    await page.evaluate(() => (document.querySelector('button[aria-label="Ticket actions"]') as HTMLElement)?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="menuitem"]');
      for (const item of items) { if (item.textContent?.trim() === "Delete") { (item as HTMLElement).click(); break; } }
    });

    await page.waitForSelector('button.btn-destructive');
    await page.click('button.btn-destructive');

    await page.waitForTimeout(1000);
    expect(await page.locator("[data-drag-source]").count()).toBe(countBefore - 1);
  }, 15000);
});
