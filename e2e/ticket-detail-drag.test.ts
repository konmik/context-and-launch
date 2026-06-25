import { describe, it, expect } from "vitest";
import type { Page } from "playwright";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  setupE2E,
} from "./fixtures.js";

describe("Ticket detail window dragging (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`tdd-${suffix}`),
      withTickets: [{
        number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
      }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    return project;
  }

  async function dragFrom(page: Page, sx: number, sy: number) {
    const positioner = page.locator('[data-scope="floating-panel"][data-part="positioner"]');
    const beforeBox = await positioner.boundingBox();
    expect(beforeBox).toBeTruthy();

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForTimeout(100);
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(sx + i * 10, sy + i * 5);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(200);

    const afterBox = await positioner.boundingBox();
    expect(afterBox).toBeTruthy();
    expect(afterBox!.x).not.toBeCloseTo(beforeBox!.x, 0);
  }

  it("area above title inputs initiates drag", async () => {
    await setup("above-title");
    const page = ctx.page;

    const dragTrigger = page.locator('[data-scope="floating-panel"][data-part="drag-trigger"]');
    await dragTrigger.waitFor({ state: "visible", timeout: 15000 });
    const triggerBox = await dragTrigger.boundingBox();
    expect(triggerBox).toBeTruthy();

    await dragFrom(page, triggerBox!.x + triggerBox!.width / 2, triggerBox!.y + 5);
  }, 60000);

  it("gap between title inputs initiates drag", async () => {
    await setup("between-inputs");
    const page = ctx.page;

    const numBox = await page.locator('[data-testid="ticket-detail-number-input"]').boundingBox();
    const titleBox = await page.locator('[data-testid="ticket-detail-title-input"]').boundingBox();
    expect(numBox).toBeTruthy();
    expect(titleBox).toBeTruthy();

    await dragFrom(page, (numBox!.x + numBox!.width + titleBox!.x) / 2, numBox!.y + numBox!.height / 2);
  }, 60000);
}, 120000);
