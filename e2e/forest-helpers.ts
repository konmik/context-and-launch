import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import type { Locator, Page } from "playwright";
import {
  dragPointer,
  gotoProject,
  seedProject,
  type CreatedProject,
  type E2EContext,
  type ScreenPoint,
  type SeedTicket,
} from "./fixtures.js";
import { countOf, testId, waitGone, waitVisible } from "./locators.js";

const forestBoards = [
  { id: "default", name: "Default", columns: [{ name: "todo" }, { name: "done" }] },
];

export type ForestSeedTicket = Omit<SeedTicket, "status"> & { status?: string };

export interface OpenForestOptions {
  slugBase: string;
  tickets: ForestSeedTicket[];
  layout?: Record<string, { x: number; y: number }>;
  view?: "forest" | "kanban";
}

export async function openForestProject(
  ctx: E2EContext,
  options: OpenForestOptions,
): Promise<CreatedProject> {
  const project = await seedProject(ctx, {
    slugBase: options.slugBase,
    withBoards: forestBoards,
    withTickets: options.tickets.map(ticket => ({ status: "todo", ...ticket })),
  });
  if (options.layout) {
    fs.writeFileSync(
      path.join(project.ticketsPath, "forest-layout.json"),
      JSON.stringify(options.layout),
    );
  }
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
  if (options.view !== "kanban") await toggleToForest(ctx.page);
  return project;
}

export async function toggleToForest(page: Page): Promise<void> {
  await testId(page, "project-header-forest-toggle-button").click();
  await waitVisible(page, "forest-rearrange-button");
}

export async function toggleToKanban(page: Page): Promise<void> {
  await testId(page, "project-header-forest-toggle-button").click();
  await waitVisible(page, "kanban-board-column-header");
}

export async function waitForForestTicketCount(page: Page, expected: number): Promise<void> {
  await expect.poll(() => countOf(page, "forest-ticket-card"), { timeout: 15000 })
    .toBe(expected);
}

export function forestSurface(page: Page): Locator {
  return testId(page, "forest-surface");
}

export function forestCard(page: Page, ticketNumber: string): Locator {
  return testId(page, "forest-ticket-card", { "data-ticket-number": ticketNumber });
}

export function forestGroupCard(page: Page, ticketNumber?: string): Locator {
  return ticketNumber
    ? testId(page, "forest-group-card", { "data-ticket-number": ticketNumber })
    : testId(page, "forest-group-card");
}

export function forestHandle(page: Page, ticketNumber: string, end: "top" | "bottom"): Locator {
  return testId(page, `forest-handle-${end}`, { "data-ticket-number": ticketNumber });
}

export async function shiftDragSelection(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
): Promise<void> {
  await page.keyboard.down("Shift");
  await dragPointer(page, from, to, { stepDelayMs: 20 });
  await page.keyboard.up("Shift");
  await page.waitForTimeout(300);
}

export async function clickHandle(
  page: Page,
  ticketNumber: string,
  end: "top" | "bottom",
): Promise<void> {
  await page.locator(`[data-forest-card][data-ticket-number="${ticketNumber}"]`).hover();
  await forestHandle(page, ticketNumber, end).click();
}

export async function pathScreenPoint(
  locator: Locator,
  at: "start" | "middle" | "end",
): Promise<ScreenPoint> {
  return await locator.evaluate((element, position) => {
    const svgPath = element as SVGPathElement;
    const total = svgPath.getTotalLength();
    const length = position === "start" ? 0 : position === "middle" ? total / 2 : total;
    const point = svgPath.getPointAtLength(length);
    const matrix = svgPath.getScreenCTM();
    if (!matrix) throw new Error("Path is not rendered on screen");
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
  }, at);
}

export async function pathScreenEndpoints(
  locator: Locator,
): Promise<{ start: ScreenPoint; end: ScreenPoint }> {
  return {
    start: await pathScreenPoint(locator, "start"),
    end: await pathScreenPoint(locator, "end"),
  };
}

export async function deleteDependencyViaPopup(page: Page): Promise<void> {
  const deleteButton = await waitVisible(page, "forest-dependency-delete");
  await deleteButton.click();
}

export function subforestCloseButton(page: Page): Locator {
  return testId(page, "forest-subforest-close");
}

export async function openSubforest(page: Page, ticketNumber?: string): Promise<void> {
  await forestGroupCard(page, ticketNumber).click();
  await waitVisible(page, "forest-subforest-close");
}

export async function closeSubforest(page: Page): Promise<void> {
  await subforestCloseButton(page).click();
  await waitGone(page, "forest-subforest-close");
}

export async function groupViaDialog(page: Page, number: string, title: string): Promise<void> {
  await testId(page, "forest-group-button").click();
  await waitVisible(page, "create-ticket-number-input");
  await testId(page, "create-ticket-number-input").fill(number);
  await testId(page, "create-ticket-title-input").fill(title);
  await testId(page, "create-ticket-submit").click();
  await waitGone(page, "create-ticket-number-input");
  await page.waitForTimeout(1000);
}
