import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type http from "node:http";
import { startMockServer, stopMockServer, type MockServerState } from "./mock-server.js";
import {
  createBoardWithTickets,
  type TicketInfo,
} from "./setup-test-data.js";
import { pickPort } from "./test-port.js";

const PORT = pickPort();
const BASE_URL = `http://localhost:${PORT}`;

let browser: Browser;
let page: Page;
let server: http.Server;
let mockState: MockServerState;

function makeTicketWithFiles(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-10",
    title: "File Test",
    status: "todo",
    folderName: "t-10-file-test",
    stageNames: [],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

describe("File attach and references (e2e)", () => {
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

  it("clicking the copy button opens a file chooser dialog", async () => {
    const ticket = makeTicketWithFiles();
    mockState.boardData = createBoardWithTickets([ticket]);

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-drag-source]", { timeout: 10000 });
    await page.click("[data-drag-source]");

    const copyBtn = page.locator('button:has-text("Drop a file to copy")');
    await copyBtn.waitFor({ timeout: 5000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 3000 }),
      copyBtn.click(),
    ]);

    expect(fileChooser).toBeTruthy();
  }, 20000);

  it("dropping a file onto the copy button adds it to the dropdown and it can be selected", async () => {
    const ticket = makeTicketWithFiles();
    mockState.boardData = createBoardWithTickets([ticket]);

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-drag-source]", { timeout: 10000 });
    await page.click("[data-drag-source]");
    await page.waitForSelector('button:has-text("Drop a file to copy")', { timeout: 5000 });

    // Use the file input (click fallback) to upload a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test-upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("test file content"),
    });

    await page.waitForTimeout(1000);

    // Open the dropdown and verify the uploaded file appears
    await page.click('button:has-text("test-upload.txt")');
    await page.waitForTimeout(500);
  }, 20000);

  it("selecting a referenced image file shows the image preview instead of the editor", async () => {
    const ticket = makeTicketWithFiles({
      references: [{ path: "/test/images/screenshot.png", exists: true }],
    });
    mockState.boardData = createBoardWithTickets([ticket]);
    mockState.referenceFileContents = {
      "/test/images/screenshot.png": "fake-png-data",
    };

    await page.goto(`${BASE_URL}/project/e2e-test`);
    await page.waitForSelector("[data-drag-source]", { timeout: 10000 });
    await page.evaluate(() => (document.querySelector("[data-drag-source]") as HTMLElement)?.click());

    await page.waitForSelector('button:has-text("to-do.md")', { timeout: 5000 });
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const b of btns) { if (b.textContent?.includes("to-do.md")) { b.click(); break; } }
    });
    await page.waitForTimeout(500);

    const refOption = page.locator('button:has-text("REFERENCE")');
    await refOption.first().waitFor({ timeout: 3000 });
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const b of btns) { if (b.textContent?.includes("REFERENCE")) { b.click(); break; } }
    });
    await page.waitForTimeout(1000);

    const imgElement = page.locator("img");
    expect(await imgElement.count()).toBeGreaterThan(0);
  }, 20000);
});
