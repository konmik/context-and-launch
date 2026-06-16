import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { type Browser, type Page } from "playwright";
import {
  createServer, launchBrowser, createProject, uniqueSlug, gotoProject,
  type TestServer, type TestBrowser, type CreatedProject,
  readTicketStatus,
} from "./fixtures.js";

let testServer: TestServer;
let testBrowser: TestBrowser;
let browser: Browser;
let page: Page;

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

const TICKETS = [
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" },
  { number: "T-2", title: "Bravo", status: "todo", folderName: "t-2-bravo" },
  { number: "T-3", title: "Charlie", status: "in-progress", folderName: "t-3-charlie" },
  { number: "T-4", title: "Delta", status: "in-progress", folderName: "t-4-delta" },
];

const APP_BOARDS = [
  { id: "standard", name: "Standard", columns: [
    { name: "todo" }, { name: "in-progress" }, { name: "done" },
  ]},
];

describe("KanbanBoard drag-and-drop (e2e, real server)", () => {
  let project: CreatedProject;
  beforeAll(async () => {
    testServer = await createServer();
    testBrowser = await launchBrowser();
    browser = testBrowser.browser;
  }, 60000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    project = await createProject(testServer, {
      projectSlug: uniqueSlug("dnd"),
      withBoards: APP_BOARDS,
      withTickets: TICKETS,
    });
    await gotoProject(page, testServer, project.projectSlug);
  });

  afterEach(async () => {
    await page?.close();
    project?.cleanup();
  });

  afterAll(async () => {
    await testBrowser?.stop();
    await testServer?.stop();
  }, 20000);

  it("renders test tickets in correct columns", async () => {
    await page.waitForSelector("[data-sortable-id]", { timeout: 10000 });
    const columns = await getSortablesByColumn(page);
    const todo = columns.get("todo") ?? [];
    const inProgress = columns.get("in-progress") ?? [];
    expect(todo.length).toBe(2);
    expect(inProgress.length).toBe(2);
    expect(todo[0]).toContain("t-1-alpha");
    expect(inProgress[0]).toContain("t-3-charlie");
  }, 60000);

  it("persists cross-column drop to disk", async () => {
    await page.waitForSelector("[data-sortable-id]", { timeout: 10000 });
    const before = await getSortablesByColumn(page);
    const todo = before.get("todo")!;
    const inProgress = before.get("in-progress")!;
    const movedFolder = todo[0].split(":")[1];

    await dragTo(page, todo[0], inProgress[0]);
    await page.mouse.up();
    await page.waitForTimeout(2000);

    const after = await getSortablesByColumn(page);
    const ipAfter = after.get("in-progress") ?? [];
    expect(ipAfter.some((id) => id.includes(movedFolder))).toBe(true);
    const status = readTicketStatus(testServer, project.projectSlug, movedFolder);
    expect(status?.status).toBe("in-progress");
  }, 60000);

  it("same position drop does not modify ticket-order.json", async () => {
    await page.waitForSelector("[data-sortable-id]", { timeout: 10000 });

    const orderFile = path.join(
      testServer.dataDir, "projects", project.projectSlug, "tickets", "ticket-order.json",
    );
    const beforeContent = fs.readFileSync(orderFile, "utf-8");

    await dragTo(page, "todo:t-1-alpha", "todo:t-1-alpha");
    await page.mouse.up();
    await page.waitForTimeout(2000);

    const afterContent = fs.readFileSync(orderFile, "utf-8");
    expect(afterContent).toBe(beforeContent);
  }, 60000);
});
