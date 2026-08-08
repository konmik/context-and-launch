import { describe, it, expect } from "vitest";
import { type Page } from "playwright";
import {
  openProject, setupE2E,
  type SeedTicket,
} from "./fixtures.js";
import { countOf, testId } from "./locators.js";

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
  return testId(p, "kanban-board-column-header", { "data-column-name": name });
}

function columnHeaderCell(p: Page, name: string) {
  return testId(p, "kanban-board-column-header-cell", { "data-column-name": name });
}

function columnBody(p: Page, name: string) {
  return testId(p, "kanban-board-column-body", { "data-column-name": name });
}

function boardScroll(p: Page) {
  return testId(p, "kanban-board-scroll");
}

describe("KanbanBoard board scrolling (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string): Promise<void> {
    await openProject(ctx, {
      slugBase: `scroll-${suffix}`,
      withBoards: APP_BOARDS,
      withTickets: TICKETS,
    });
    await ctx.page.locator("[data-sortable-id]").first()
      .waitFor({ state: "visible", timeout: 10000 });
  }

  it("scrolls all columns together, leaving the headers in place", async () => {
    await setup("together");
    const scroller = boardScroll(ctx.page);
    const before = (await columnHeader(ctx.page, "todo").boundingBox())!;

    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const after = (await columnHeader(ctx.page, "todo").boundingBox())!;
    expect(after.y).toBe(before.y);
  });

  it("keeps the column headers outside every vertical scroll container", async () => {
    await setup("headers-outside");
    const scrollAncestors = await columnHeader(ctx.page, "todo").evaluate((el) => {
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
  });

  it("has exactly one scroll container, holding every column", async () => {
    await setup("one-scroller");
    const scrollers = await ctx.page.locator("[data-sortable-id]").first().evaluate((el) => {
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

    const bodyCount = await countOf(ctx.page, "kanban-board-column-body");
    const inScroller = await testId(boardScroll(ctx.page), "kanban-board-column-body").count();
    expect(bodyCount).toBe(COLUMNS.length);
    expect(inScroller).toBe(COLUMNS.length);
  });

  it("aligns each header with its column body", async () => {
    await setup("aligns");
    for (const column of COLUMNS) {
      const header = (await columnHeaderCell(ctx.page, column.name).boundingBox())!;
      const body = (await columnBody(ctx.page, column.name).boundingBox())!;
      expect(Math.abs(header.x - body.x)).toBeLessThan(1);
      expect(Math.abs(header.width - body.width)).toBeLessThan(1);
    }
  });

  it("keeps headers aligned while the board scrolls horizontally", async () => {
    await setup("horizontal");
    await ctx.page.setViewportSize({ width: 700, height: 800 });
    const scroller = boardScroll(ctx.page);
    await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const scrollLeft = await scroller.evaluate((el) => el.scrollLeft);
    expect(scrollLeft).toBeGreaterThan(0);

    await ctx.page.waitForFunction((left) => {
      const header = document.querySelector('[data-testid="kanban-board-scroll"]')
        ?.previousElementSibling;
      return header instanceof HTMLElement && header.scrollLeft === left;
    }, scrollLeft, { timeout: 5000 });

    for (const column of COLUMNS) {
      const header = (await columnHeaderCell(ctx.page, column.name).boundingBox())!;
      const body = (await columnBody(ctx.page, column.name).boundingBox())!;
      expect(Math.abs(header.x - body.x)).toBeLessThan(1);
    }
  });
});
