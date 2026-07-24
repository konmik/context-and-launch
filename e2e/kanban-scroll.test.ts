import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { type Browser, type Page } from "playwright";
import {
  createServer, launchBrowser, createProject, uniqueSlug, gotoProject,
  type TestServer, type TestBrowser, type CreatedProject,
  type SeedTicket,
} from "./fixtures.js";

let testServer: TestServer;
let testBrowser: TestBrowser;
let browser: Browser;
let page: Page;

const TICKETS: SeedTicket[] = Array.from({ length: 40 }, (_, i) => ({
  number: `T-${i + 1}`,
  title: `Ticket ${i + 1}`,
  status: "todo",
  folderName: `t-${i + 1}-ticket`,
}));

const COLUMNS = [
  { name: "todo", description: "Work items" },
  { name: "in-progress" },
  { name: "review" },
  { name: "done" },
];

const APP_BOARDS = [{ id: "standard", name: "Standard", columns: COLUMNS }];

function columnHeader(p: Page, name: string) {
  return p.locator(
    `[data-testid="kanban-board-column-header"][data-column-name="${name}"]`,
  );
}

function columnHeaderCell(p: Page, name: string) {
  return p.locator(
    `[data-testid="kanban-board-column-header-cell"][data-column-name="${name}"]`,
  );
}

function columnBody(p: Page, name: string) {
  return p.locator(
    `[data-testid="kanban-board-column-body"][data-column-name="${name}"]`,
  );
}

function boardScroll(p: Page) {
  return p.locator('[data-testid="kanban-board-scroll"]');
}

describe("KanbanBoard board scrolling (e2e, real server)", () => {
  let project: CreatedProject;
  beforeAll(async () => {
    testServer = await createServer();
    testBrowser = await launchBrowser();
    browser = testBrowser.browser;
  }, 60000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    project = await createProject(testServer, {
      projectSlug: uniqueSlug("scroll"),
      withBoards: APP_BOARDS,
      withTickets: TICKETS,
    });
    await gotoProject(page, testServer, project.projectSlug);
    await page.waitForSelector("[data-sortable-id]", { timeout: 10000 });
  });

  afterEach(async () => {
    await page?.close();
    project?.cleanup();
  });

  afterAll(async () => {
    await testBrowser?.stop();
    await testServer?.stop();
  }, 20000);

  it("scrolls all columns together, leaving the headers in place", async () => {
    const scroller = boardScroll(page);
    const before = (await columnHeader(page, "todo").boundingBox())!;

    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const after = (await columnHeader(page, "todo").boundingBox())!;
    expect(after.y).toBe(before.y);
  }, 60000);

  it("keeps the column headers outside every vertical scroll container", async () => {
    const scrollAncestors = await columnHeader(page, "todo").evaluate((el) => {
      const found: string[] = [];
      let node = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY)) {
          found.push(node.getAttribute("data-testid") ?? node.tagName);
        }
        node = node.parentElement;
      }
      return found;
    });
    expect(scrollAncestors).toEqual([]);
  }, 60000);

  it("has exactly one scroll container, holding every column", async () => {
    const scrollers = await page.locator("[data-sortable-id]").first().evaluate((el) => {
      const found: string[] = [];
      let node = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY)
          && node.scrollHeight > node.clientHeight + 1) {
          found.push(node.getAttribute("data-testid") ?? node.tagName);
        }
        node = node.parentElement;
      }
      return found;
    });
    expect(scrollers).toEqual(["kanban-board-scroll"]);

    const bodyCount = await page.locator('[data-testid="kanban-board-column-body"]').count();
    const inScroller = await boardScroll(page)
      .locator('[data-testid="kanban-board-column-body"]').count();
    expect(bodyCount).toBe(COLUMNS.length);
    expect(inScroller).toBe(COLUMNS.length);
  }, 60000);

  it("aligns each header with its column body", async () => {
    for (const column of COLUMNS) {
      const header = (await columnHeaderCell(page, column.name).boundingBox())!;
      const body = (await columnBody(page, column.name).boundingBox())!;
      expect(Math.abs(header.x - body.x)).toBeLessThan(1);
      expect(Math.abs(header.width - body.width)).toBeLessThan(1);
    }
  }, 60000);

  it("keeps headers aligned while the board scrolls horizontally", async () => {
    await page.setViewportSize({ width: 700, height: 800 });
    const scroller = boardScroll(page);
    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const scrollLeft = await scroller.evaluate((el) => el.scrollLeft);
    expect(scrollLeft).toBeGreaterThan(0);

    await page.waitForFunction((left) => {
      const header = document.querySelector('[data-testid="kanban-board-scroll"]')
        ?.previousElementSibling;
      return header instanceof HTMLElement && header.scrollLeft === left;
    }, scrollLeft, { timeout: 5000 });

    for (const column of COLUMNS) {
      const header = (await columnHeaderCell(page, column.name).boundingBox())!;
      const body = (await columnBody(page, column.name).boundingBox())!;
      expect(Math.abs(header.x - body.x)).toBeLessThan(1);
    }
  }, 60000);
});
