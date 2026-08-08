import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { type Page } from "playwright";
import {
  dragElement, openProject, sortableItem,
  type CreatedProject,
  readTicketStatus, poll, setupE2E, THREE_COLUMN_BOARD,
} from "./fixtures.js";

async function getSortablesByColumn(p: Page) {
  const ids = await p.locator("[data-sortable-id]").evaluateAll(
    (elements) => elements.map((e) => e.getAttribute("data-sortable-id") ?? ""),
  );
  const columns = new Map<string, string[]>();
  for (const id of ids) {
    if (!id) continue;
    const col = id.split(":")[0];
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col)!.push(id);
  }
  return columns;
}

/**
 * The board's drag sensor needs a press-and-hold before it arms, and its drop
 * handler runs off the last pointer position, so the pointer settles before it
 * is released.
 */
function dragCard(p: Page, sourceId: string, targetId: string) {
  return dragElement(p, sortableItem(p, sourceId), sortableItem(p, targetId), {
    releaseAt: "top",
    holdMs: 150,
    steps: 20,
    settleMs: 200,
  });
}

const TICKETS = [
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" },
  { number: "T-2", title: "Bravo", status: "todo", folderName: "t-2-bravo" },
  { number: "T-3", title: "Charlie", status: "in-progress", folderName: "t-3-charlie" },
  { number: "T-4", title: "Delta", status: "in-progress", folderName: "t-4-delta" },
];

describe("KanbanBoard drag-and-drop (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string): Promise<CreatedProject> {
    const project = await openProject(ctx, {
      slugBase: `dnd-${suffix}`,
      withBoards: THREE_COLUMN_BOARD,
      withTickets: TICKETS,
    });
    await ctx.page.locator("[data-sortable-id]").first()
      .waitFor({ state: "visible", timeout: 10000 });
    return project;
  }

  it("renders test tickets in correct columns", async () => {
    await setup("renders");
    const columns = await getSortablesByColumn(ctx.page);
    const todo = columns.get("todo") ?? [];
    const inProgress = columns.get("in-progress") ?? [];
    expect(todo.length).toBe(2);
    expect(inProgress.length).toBe(2);
    expect(todo[0]).toContain("t-1-alpha");
    expect(inProgress[0]).toContain("t-3-charlie");
  });

  it("persists cross-column drop to disk", async () => {
    const project = await setup("cross-column");
    const before = await getSortablesByColumn(ctx.page);
    const todo = before.get("todo")!;
    const inProgress = before.get("in-progress")!;
    const movedFolder = todo[0].split(":")[1];

    await dragCard(ctx.page, todo[0], inProgress[0]);
    const status = await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, movedFolder),
      (s) => s?.status === "in-progress",
      5000,
    );

    const after = await getSortablesByColumn(ctx.page);
    const ipAfter = after.get("in-progress") ?? [];
    expect(ipAfter.some((id) => id.includes(movedFolder))).toBe(true);
    expect(status?.status).toBe("in-progress");
  });

  it("same position drop does not modify ticket-order.json", async () => {
    const project = await setup("same-position");

    const orderFile = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets", "ticket-order.json",
    );
    const beforeContent = fs.readFileSync(orderFile, "utf-8");

    await dragCard(ctx.page, "todo:t-1-alpha", "todo:t-1-alpha");
    await ctx.page.waitForTimeout(2000);

    const afterContent = fs.readFileSync(orderFile, "utf-8");
    expect(afterContent).toBe(beforeContent);
  });
});
