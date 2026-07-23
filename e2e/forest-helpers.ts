import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import {
  createProject,
  gotoProject,
  uniqueSlug,
  type CreatedProject,
  type E2EContext,
  type SeedTicket,
} from "./fixtures.js";

export const forestBoards = [
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
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug(options.slugBase),
    withBoards: forestBoards,
    withTickets: options.tickets.map(ticket => ({ status: "todo", ...ticket })),
  });
  ctx.projects.push(project);
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
  await page.click('[data-testid="project-header-forest-toggle-button"]');
  await page.waitForSelector('[data-testid="forest-rearrange-button"]', {
    state: "visible", timeout: 15000,
  });
}

export async function toggleToKanban(page: Page): Promise<void> {
  await page.click('[data-testid="project-header-forest-toggle-button"]');
  await page.waitForSelector('[data-testid="kanban-board-column-header"]', {
    state: "visible", timeout: 15000,
  });
}

export async function waitForForestTicketCount(page: Page, expected: number): Promise<void> {
  await page.waitForFunction(
    count => document.querySelectorAll('[data-testid="forest-ticket-card"]').length === count,
    expected,
    { timeout: 15000 },
  );
}

export function forestSurface(page: Page): Locator {
  return page.locator('[data-testid="forest-surface"]');
}

export function forestCard(page: Page, ticketNumber: string): Locator {
  return page.locator(`[data-testid="forest-ticket-card"][data-ticket-number="${ticketNumber}"]`);
}

export function forestGroupCard(page: Page, ticketNumber?: string): Locator {
  return page.locator(ticketNumber
    ? `[data-testid="forest-group-card"][data-ticket-number="${ticketNumber}"]`
    : '[data-testid="forest-group-card"]');
}

export function forestHandle(page: Page, ticketNumber: string, end: "top" | "bottom"): Locator {
  return page.locator(`[data-testid="forest-handle-${end}"][data-ticket-number="${ticketNumber}"]`);
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function boxOf(locator: Locator): Promise<ScreenBox> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no bounding box");
  return box;
}

export function boxCenter(box: ScreenBox): ScreenPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function centerOf(locator: Locator): Promise<ScreenPoint> {
  return boxCenter(await boxOf(locator));
}

export interface DragPointerOptions {
  steps?: number;
  stepDelayMs?: number;
}

export async function dragPointer(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
  options: DragPointerOptions = {},
): Promise<void> {
  const steps = options.steps ?? 10;
  const stepDelayMs = options.stepDelayMs ?? 30;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps),
    );
    await page.waitForTimeout(stepDelayMs);
  }
  await page.mouse.up();
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
  const deleteButton = page.locator('[data-testid="forest-dependency-delete"]');
  await deleteButton.waitFor({ state: "visible", timeout: 10000 });
  await deleteButton.click();
}

export function subforestCloseButton(page: Page): Locator {
  return page.locator('[data-testid="forest-subforest-close"]');
}

export async function openSubforest(page: Page, ticketNumber?: string): Promise<void> {
  await forestGroupCard(page, ticketNumber).click();
  await subforestCloseButton(page).waitFor({ state: "visible", timeout: 10000 });
}

export async function closeSubforest(page: Page): Promise<void> {
  const closeButton = subforestCloseButton(page);
  await closeButton.click();
  await closeButton.waitFor({ state: "detached", timeout: 10000 });
}

export async function groupViaDialog(page: Page, number: string, title: string): Promise<void> {
  await page.click('[data-testid="forest-group-button"]');
  await page.waitForSelector('[data-testid="create-ticket-number-input"]', {
    state: "visible", timeout: 15000,
  });
  await page.fill('[data-testid="create-ticket-number-input"]', number);
  await page.fill('[data-testid="create-ticket-title-input"]', title);
  await page.click('[data-testid="create-ticket-submit"]');
  await page.waitForSelector('[data-testid="create-ticket-number-input"]', {
    state: "detached", timeout: 15000,
  });
  await page.waitForTimeout(1000);
}
