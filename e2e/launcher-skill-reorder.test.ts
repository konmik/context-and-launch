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

const TICKET: TicketInfo = {
  number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
  contextNames: [], useWorktree: false, fileNames: [], references: [],
};

function freshConfig() {
  return {
    templates: [{ name: "Default", text: "do it", scope: "app" }],
    skills: [
      { name: "alpha-skill", text: "a", scope: "app" },
      { name: "bravo-skill", text: "b", scope: "app" },
      { name: "charlie-skill", text: "c", scope: "app" },
    ],
    profiles: [{ name: "Claude", command: "claude", scope: "app" }],
    shortcuts: [],
    columnDefaults: {} as Record<string, any>,
    worktreeRootPath: null,
  };
}

async function skillNames(p: Page): Promise<string[]> {
  return p.locator('[data-testid="launcher-skill-row"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-skill-name") ?? ""));
}

async function dragSkill(p: Page, fromName: string, toName: string) {
  const s = (await p.locator(
    `[data-skill-name="${fromName}"] [data-testid="launcher-skill-drag-handle"]`,
  ).boundingBox())!;
  const t = (await p.locator(`[data-skill-name="${toName}"]`).boundingBox())!;
  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height / 2;
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  await p.waitForTimeout(150);
  for (let i = 1; i <= 20; i++) {
    await p.mouse.move(sx + (tx - sx) * (i / 20), sy + (ty - sy) * (i / 20));
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(200);
  await p.mouse.up();
  await p.waitForTimeout(300);
}

async function openLauncher(p: Page) {
  await p.goto(`${BASE_URL}/project/e2e-test`);
  await p.waitForSelector("[data-sortable-id]");
  await p.locator('[data-sortable-id^="todo:"]').first().click();
  await p.waitForSelector('[data-scope="tabs"][data-part="trigger"][data-value="launcher"]', { timeout: 5000 });
  await p.click('[data-scope="tabs"][data-part="trigger"][data-value="launcher"]');
  await p.waitForSelector('[data-testid="launcher-skill-row"]', { timeout: 5000 });
}

describe("Agent launcher skill reorder (e2e)", () => {
  beforeAll(async () => {
    mockState = { boardData: createBoardWithTickets([TICKET]) };
    server = await startMockServer(PORT, mockState);
    browser = await chromium.launch({ headless: true });
  }, 30000);

  beforeEach(async () => {
    mockState.boardData = createBoardWithTickets([TICKET]);
    mockState.launcherConfig = freshConfig();
    page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  });

  afterEach(async () => { await page?.close(); });

  afterAll(async () => {
    await browser?.close();
    if (server) await stopMockServer(server);
  }, 15000);

  it("renders skills in merged config order by default", async () => {
    await openLauncher(page);
    expect(await skillNames(page)).toEqual(["alpha-skill", "bravo-skill", "charlie-skill"]);
  }, 20000);

  it("drag reorders skills and persists to the ticket status defaults only", async () => {
    await openLauncher(page);
    await dragSkill(page, "alpha-skill", "charlie-skill");

    const after = await skillNames(page);
    expect(after[0]).not.toBe("alpha-skill");
    expect(after).toContain("alpha-skill");
    expect(mockState.launcherConfig!.columnDefaults["todo"].skillOrder).toEqual(after);
    expect(mockState.launcherConfig!.skills.map((s) => s.name)).toEqual(
      ["alpha-skill", "bravo-skill", "charlie-skill"],
    );
  }, 20000);

  it("applies a saved per-status skill order on open", async () => {
    mockState.launcherConfig!.columnDefaults = {
      todo: {
        templateName: null, checkedSkills: [], profileName: null,
        skillOrder: ["charlie-skill", "alpha-skill", "bravo-skill"],
      },
    };
    await openLauncher(page);
    expect(await skillNames(page)).toEqual(["charlie-skill", "alpha-skill", "bravo-skill"]);
  }, 20000);
});
