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

const TICKETS: TicketInfo[] = [
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha", stageNames: [], useWorktree: false, fileNames: [], references: [] },
];

describe("Ripple on Ark UI buttons (e2e)", () => {
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

  it("project picker ripple is clipped and anchored to the trigger, not 0,0", async () => {
    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("h3");

    const trigger = page.locator('[data-scope="menu"][data-part="trigger"]').first();
    const box = await trigger.boundingBox();
    if (!box) throw new Error("trigger has no bounding box");

    // Press without releasing so the ripple span is present (pointerdown adds it).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    const result = await trigger.evaluate((el) => {
      const style = getComputedStyle(el);
      const ripple = el.querySelector(".ripple-effect") as HTMLElement | null;
      const elRect = el.getBoundingClientRect();
      const rippleRect = ripple?.getBoundingClientRect() ?? null;
      return {
        position: style.position,
        overflow: style.overflow,
        hasRipple: !!ripple,
        elTop: elRect.top,
        rippleTop: rippleRect?.top ?? null,
      };
    });

    await page.mouse.up();

    expect(result.hasRipple).toBe(true);
    // Host must be a positioned, clipping container.
    expect(result.position).not.toBe("static");
    expect(result.overflow).toBe("hidden");
    // Ripple must be anchored near the trigger, not at the viewport origin (0,0).
    expect(result.rippleTop).not.toBeNull();
    expect(Math.abs((result.rippleTop as number) - result.elTop)).toBeLessThan(box.height + 50);
  }, 15000);
});
