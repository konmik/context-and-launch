import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import { EMPTY_BOARD } from "./setup-test-data.js";
import { pickPort } from "./test-port.js";

const PORT = pickPort();
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

describe("Add project welcome screen (e2e)", () => {
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

  it("shows a branch name field defaulting to tickets and lets the user edit it", async () => {
    await page.goto(`${BASE_URL}/add-project`);
    const input = await page.waitForSelector("#project-branch", {
      state: "visible",
      timeout: 5000,
    });
    expect(await input.inputValue()).toBe("tickets");

    await input.fill("work-items");
    expect(await input.inputValue()).toBe("work-items");
  }, 15000);

  it("submits the chosen branch and navigates to the new project board", async () => {
    let received: { path: string; branch: string } | null = null;
    mockState.onAddProject = (path, branch) => {
      received = { path, branch };
      return { slug: "e2e-test" };
    };

    await page.goto(`${BASE_URL}/add-project`);
    await page.waitForSelector("#project-branch", { state: "visible", timeout: 5000 });

    await page.fill("#project-path", "/path/to/repo");
    await page.fill("#project-branch", "work-items");
    await page.click('button[type="submit"]');

    await page.waitForURL(`${BASE_URL}/project/e2e-test`, { timeout: 5000 });
    expect(received).toEqual({ path: "/path/to/repo", branch: "work-items" });
  }, 15000);
});
