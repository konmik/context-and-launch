import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  setupE2E, readTicketStatus, listTicketFolders, poll,
} from "./fixtures.js";
import {
  boxOf, forestGroupCard, forestSurface, groupViaDialog, openForestProject,
  openSubforest, shiftDragSelection, toggleToForest,
} from "./forest-helpers.js";

describe("Forest group lifecycle", () => {
  const ctx = setupE2E();

  it("rectangle selection + grouping creates group and hides members", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-select",
      tickets: [
        { number: "A-1", title: "First" },
        { number: "A-2", title: "Second" },
      ],
    });

    await ctx.page.waitForSelector('[data-testid="forest-ticket-card"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(2);

    const surfaceBox = await boxOf(forestSurface(ctx.page));
    await shiftDragSelection(
      ctx.page,
      { x: surfaceBox.x + 10, y: surfaceBox.y + 10 },
      { x: surfaceBox.x + surfaceBox.width - 10, y: surfaceBox.y + surfaceBox.height - 10 },
    );

    await ctx.page.locator('[data-testid="forest-group-button"]')
      .waitFor({ state: "visible", timeout: 10000 });
    await groupViaDialog(ctx.page, "G-1", "My Group");

    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    expect(folders.find((f) => f.startsWith("g-1-"))).toBeDefined();

    const s1 = readTicketStatus(ctx.testServer, project.projectSlug, "a-1-first");
    const s2 = readTicketStatus(ctx.testServer, project.projectSlug, "a-2-second");
    expect(s1?.memberOf).toBe("G-1");
    expect(s2?.memberOf).toBe("G-1");

    await ctx.page.waitForTimeout(500);
    expect(await forestGroupCard(ctx.page).count()).toBeGreaterThanOrEqual(1);
  }, 120000);

  it("nested grouping sets parent memberOf", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-nested",
      tickets: [
        { number: "N-1", title: "Inner A", memberOf: "N-G" },
        { number: "N-2", title: "Inner B", memberOf: "N-G" },
        { number: "N-G", title: "Outer Group" },
      ],
    });

    await forestGroupCard(ctx.page).waitFor({ state: "visible", timeout: 15000 });
    await openSubforest(ctx.page);

    const subRearrange = ctx.page.locator('[data-testid="forest-rearrange-button"]').nth(1);
    await subRearrange.waitFor({ state: "visible", timeout: 10000 });
    await subRearrange.click();
    await ctx.page.waitForTimeout(500);

    const subSurfaceBox = await boxOf(forestSurface(ctx.page).nth(1));
    await shiftDragSelection(
      ctx.page,
      { x: subSurfaceBox.x + 10, y: subSurfaceBox.y + 80 },
      { x: subSurfaceBox.x + subSurfaceBox.width - 10, y: subSurfaceBox.y + subSurfaceBox.height - 10 },
    );

    await ctx.page.locator('[data-testid="forest-group-button"]')
      .waitFor({ state: "visible", timeout: 10000 });
    await groupViaDialog(ctx.page, "NG-1", "Nested Group");

    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    const nestedFolder = folders.find((f) => f.startsWith("ng-1-"));
    expect(nestedFolder).toBeDefined();

    const nestedStatus = readTicketStatus(ctx.testServer, project.projectSlug, nestedFolder!);
    expect(nestedStatus?.memberOf).toBe("N-G");
    await expect.poll(
      () => forestSurface(ctx.page).evaluateAll(surfaces =>
        surfaces.map(surface =>
          surface.querySelectorAll('[data-testid="forest-group-button"]').length)),
      { timeout: 10000 },
    ).toEqual([0, 0]);
  }, 120000);

  it("ungroup removes memberOf and keeps group ticket", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-ungroup",
      tickets: [
        { number: "U-1", title: "Mem A", memberOf: "U-G" },
        { number: "U-2", title: "Mem B", memberOf: "U-G" },
        { number: "U-G", title: "Grp" },
      ],
    });

    await forestGroupCard(ctx.page).waitFor({ state: "visible", timeout: 15000 });

    await ctx.page.click('[data-testid="forest-group-menu-trigger"]');
    await ctx.page.waitForTimeout(300);
    await ctx.page.click('[data-testid="forest-group-menu-ungroup"]');

    await poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "u-1-mem-a")?.memberOf,
      (m) => m === undefined,
      5000,
    );
    const s1 = readTicketStatus(ctx.testServer, project.projectSlug, "u-1-mem-a");
    const s2 = readTicketStatus(ctx.testServer, project.projectSlug, "u-2-mem-b");
    expect(s1?.memberOf).toBeUndefined();
    expect(s2?.memberOf).toBeUndefined();

    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    expect(folders.some((f) => f.startsWith("u-g-"))).toBe(true);
  }, 120000);

  it("open group ticket opens ticket detail dialog", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-open",
      tickets: [
        { number: "O-1", title: "Child", memberOf: "O-G" },
        { number: "O-G", title: "Parent Group" },
      ],
    });

    await forestGroupCard(ctx.page).waitFor({ state: "visible", timeout: 15000 });
    await ctx.page.click('[data-testid="forest-group-menu-trigger"]');
    await ctx.page.waitForTimeout(300);
    await ctx.page.click('[data-testid="forest-group-menu-open-ticket"]');

    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "visible", timeout: 15000,
    });
  }, 120000);

  it("kanban renders group and members as ordinary cards", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-kanban",
      tickets: [
        { number: "K-1", title: "Mem X", memberOf: "K-G" },
        { number: "K-2", title: "Mem Y", memberOf: "K-G" },
        { number: "K-G", title: "Grp Z" },
      ],
      view: "kanban",
    });

    expect(await ctx.page.locator('[data-testid="kanban-board-ticket-card"]').count()).toBe(3);
  }, 120000);

  it("archive hides the ticket from the forest and drops its dangling edges", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-archive",
      tickets: [
        { number: "AR-1", title: "Base" },
        { number: "AR-2", title: "Archivable", dependsOn: ["AR-1"] },
      ],
      view: "kanban",
    });

    const ar2Card = ctx.page.locator('[data-testid="kanban-board-ticket-card"]', {
      has: ctx.page.locator(`text=AR-2`),
    });
    await ar2Card.waitFor({ state: "visible", timeout: 15000 });
    await ar2Card.hover();
    await ctx.page.waitForTimeout(200);

    const menuTrigger = ar2Card.locator('[data-testid="kanban-board-ticket-menu-trigger"]');
    await menuTrigger.waitFor({ state: "visible", timeout: 10000 });
    await menuTrigger.click();
    await ctx.page.locator('[data-testid="kanban-board-ticket-menu-archive"]').first().waitFor({
      state: "attached", timeout: 10000,
    });
    await ctx.page.evaluate(() => {
      const items = document.querySelectorAll('[data-testid="kanban-board-ticket-menu-archive"]');
      const last = items[items.length - 1] as HTMLElement;
      if (last) last.click();
    });
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-cleanup-submit"]');
    await ctx.page.waitForTimeout(3000);

    expect(fs.existsSync(path.join(project.ticketsPath, "archive", "ar-2-archivable"))).toBe(true);

    await toggleToForest(ctx.page);
    await ctx.page.waitForTimeout(500);

    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="forest-external-dependency"]').count()).toBe(0);
  }, 120000);
}, 120000);
