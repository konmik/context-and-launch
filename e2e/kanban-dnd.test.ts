import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { SEEDED_BOARD } from "./setup-test-data.js";

const PORT = 3901 + Math.floor(Math.random() * 100);
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

async function getSortablesByColumn(p: Page) {
  const sortables = p.locator("[data-sortable-id]");
  const count = await sortables.count();
  const columns = new Map<string, string[]>();
  for (let i = 0; i < count; i++) {
    const id = await sortables.nth(i).getAttribute("data-sortable-id");
    if (!id) continue;
    const col = id.split(":")[0];
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(id);
  }
  return columns;
}

async function dragTo(p: Page, sourceId: string, targetId: string) {
  const source = p.locator(`[data-sortable-id="${sourceId}"]`);
  const target = p.locator(`[data-sortable-id="${targetId}"]`);
  const sBox = (await source.boundingBox())!;
  const tBox = (await target.boundingBox())!;
  const sx = sBox.x + sBox.width / 2;
  const sy = sBox.y + sBox.height / 2;
  const tx = tBox.x + tBox.width / 2;
  const ty = tBox.y + 5;

  await p.mouse.move(sx, sy);
  await p.mouse.down();
  await p.waitForTimeout(150);
  for (let i = 1; i <= 20; i++) {
    await p.mouse.move(sx + (tx - sx) * (i / 20), sy + (ty - sy) * (i / 20));
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(200);
}

describe("KanbanBoard drag-and-drop (e2e)", () => {
  beforeAll(async () => {
    mockState = {
      boardData: structuredClone(SEEDED_BOARD),
      onReorderTicket: (slug, folderName, fromColumn, toColumn, newIndex) => {
        const bd = mockState.boardData;
        const ticket = bd.board!.tickets.find((t) => t.folderName === folderName);
        if (ticket) {
          // Remove from old column order
          const fromOrder = bd.board!.ticketOrder[fromColumn];
          const fromIdx = fromOrder.indexOf(folderName);
          if (fromIdx >= 0) fromOrder.splice(fromIdx, 1);

          // Add to new column order
          if (!bd.board!.ticketOrder[toColumn]) {
            bd.board!.ticketOrder[toColumn] = [];
          }
          const toOrder = bd.board!.ticketOrder[toColumn];
          toOrder.splice(newIndex, 0, folderName);

          // Update ticket status
          ticket.status = toColumn;
        }
        return { success: true };
      },
    };

    server = await startMockServer(PORT, mockState);
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    if (server) await stopMockServer(server);
  }, 15000);

  it("renders test tickets in correct columns", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-sortable-id]");

    const columns = await getSortablesByColumn(page);
    const todo = columns.get("todo") ?? [];
    const inProgress = columns.get("in-progress") ?? [];

    expect(todo.length).toBe(2);
    expect(inProgress.length).toBe(2);
    expect(todo[0]).toContain("t-1-alpha");
    expect(inProgress[0]).toContain("t-3-charlie");
  }, 15000);

  it("shows drag overlay and dims source during same-column drag", async () => {
    await page.reload();
    await page.waitForSelector("[data-sortable-id]");

    const columns = await getSortablesByColumn(page);
    const todo = columns.get("todo")!;

    await dragTo(page, todo[0], todo[1]);

    expect(await page.locator(".rotate-2.scale-95").isVisible()).toBe(true);
    expect(await page.locator(".opacity-30").count()).toBeGreaterThan(0);

    await page.mouse.up();
    await page.waitForTimeout(500);
  }, 15000);

  it("shows drop indicator when dragging cross-column into column with tickets", async () => {
    await page.reload();
    await page.waitForSelector("[data-sortable-id]");

    const columns = await getSortablesByColumn(page);
    const todo = columns.get("todo")!;
    const inProgress = columns.get("in-progress")!;

    await dragTo(page, todo[0], inProgress[0]);

    const indicatorColumn = await page.evaluate(() => {
      const ind = document.querySelector("[data-drop-indicator]");
      if (!ind) return null;
      return ind.closest("[data-sortable-id]")?.getAttribute("data-sortable-id") ?? null;
    });
    expect(indicatorColumn).toBeTruthy();
    expect(indicatorColumn!.startsWith("in-progress:")).toBe(true);

    await page.mouse.up();
    await page.waitForTimeout(500);
  }, 15000);

  it("persists cross-column drop", async () => {
    await page.reload();
    await page.waitForSelector("[data-sortable-id]");

    const before = await getSortablesByColumn(page);
    const todo = before.get("todo")!;
    const inProgress = before.get("in-progress")!;
    const movedFolder = todo[0].split(":")[1];

    await dragTo(page, todo[0], inProgress[0]);
    await page.mouse.up();
    await page.waitForTimeout(2000);

    const after = await getSortablesByColumn(page);
    const todoAfter = after.get("todo") ?? [];
    const ipAfter = after.get("in-progress") ?? [];

    expect(todoAfter.some((id) => id.includes(movedFolder))).toBe(false);
    expect(ipAfter.some((id) => id.includes(movedFolder))).toBe(true);
  }, 15000);
});
