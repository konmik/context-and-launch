import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  setupE2E, readTicketStatus, listTicketFolders, poll,
} from "./fixtures.js";
import {
  boxOf, centerOf, clickHandle, deleteDependencyViaPopup, forestCard, forestGroupCard,
  forestHandle, forestSurface, groupViaDialog, openForestProject, openSubforest,
  closeSubforest, pathScreenEndpoints, pathScreenPoint, shiftDragSelection,
  subforestCloseButton, toggleToForest,
} from "./forest-helpers.js";

describe("Forest Grouping II", () => {
  const ctx = setupE2E();

  it("connects a root ticket to a ticket inside an open sub-forest", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-connect-member",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside" },
      ],
    });

    await clickHandle(ctx.page, "S-OUT", "bottom");

    await openSubforest(ctx.page, "S-G");
    await ctx.page.waitForTimeout(300);
    const groupWindowBox = await boxOf(subforestCloseButton(ctx.page).locator(".."));

    const memberHandle = forestHandle(ctx.page, "S-1", "top");
    const memberHandleCenter = await centerOf(memberHandle);
    await ctx.page.mouse.move(memberHandleCenter.x, memberHandleCenter.y);
    const previewPoints = await pathScreenEndpoints(
      ctx.page.locator('[data-testid="forest-connection-preview"]'),
    );
    expect(Math.abs(previewPoints.start.y - groupWindowBox.y)).toBeLessThan(4);
    expect(Math.abs(previewPoints.end.x - memberHandleCenter.x)).toBeLessThan(4);
    expect(Math.abs(previewPoints.end.y - memberHandleCenter.y)).toBeLessThan(4);
    expect(await memberHandle.getAttribute("data-connection-handle-state")).toBe("available");
    await memberHandle.click();

    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "s-out-outside")?.dependsOn,
      { timeout: 10000 },
    ).toContain("S-1");
    await expect.poll(
      () => ctx.page.locator('[data-connection-edit-mode="active"]').count(),
      { timeout: 10000 },
    ).toBe(0);
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);

    const externalDependency = ctx.page.locator(
      '[data-testid="forest-subforest-backdrop"] [data-testid="forest-external-dependency"]',
    );
    await externalDependency.waitFor({ state: "attached", timeout: 10000 });
    const externalEndpoints = await pathScreenEndpoints(externalDependency);
    expect(Math.abs(
      Math.min(externalEndpoints.start.y, externalEndpoints.end.y) - groupWindowBox.y,
    )).toBeLessThan(4);
  }, 120000);

  it("lands downward cross-surface connections at the bottom of the Group window", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-connect-member-down",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside" },
      ],
    });

    await clickHandle(ctx.page, "S-OUT", "top");

    await openSubforest(ctx.page, "S-G");
    await ctx.page.waitForTimeout(300);
    const groupWindowBox = await boxOf(subforestCloseButton(ctx.page).locator(".."));
    const groupWindowBottom = groupWindowBox.y + groupWindowBox.height;

    const memberHandle = forestHandle(ctx.page, "S-1", "bottom");
    const memberHandleCenter = await centerOf(memberHandle);
    await ctx.page.mouse.move(memberHandleCenter.x, memberHandleCenter.y);
    const previewPoints = await pathScreenEndpoints(
      ctx.page.locator('[data-testid="forest-connection-preview"]'),
    );
    expect(Math.abs(previewPoints.start.y - groupWindowBottom)).toBeLessThan(4);
    expect(Math.abs(previewPoints.end.x - memberHandleCenter.x)).toBeLessThan(4);
    expect(Math.abs(previewPoints.end.y - memberHandleCenter.y)).toBeLessThan(4);
    await memberHandle.click();

    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "s-1-member")?.dependsOn,
      { timeout: 10000 },
    ).toContain("S-OUT");
    await expect.poll(
      () => ctx.page.locator('[data-connection-edit-mode="active"]').count(),
      { timeout: 10000 },
    ).toBe(0);

    const externalDependency = ctx.page.locator(
      '[data-testid="forest-subforest-backdrop"] [data-testid="forest-external-dependency"]',
    );
    await externalDependency.waitFor({ state: "attached", timeout: 10000 });
    await ctx.page.waitForTimeout(300);
    const externalEndpoints = await pathScreenEndpoints(externalDependency);
    expect(Math.abs(
      Math.max(externalEndpoints.start.y, externalEndpoints.end.y) - groupWindowBottom,
    )).toBeLessThan(4);
  }, 120000);

  it("selects and deletes an inward dependency from inside a Group", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-delete-external-down",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside", dependsOn: ["S-1"] },
      ],
    });

    await openSubforest(ctx.page, "S-G");

    await ctx.page.locator('[data-testid="forest-external-dependency"]')
      .waitFor({ state: "attached", timeout: 10000 });
    const groupWindowBox = await boxOf(subforestCloseButton(ctx.page).locator(".."));
    const memberHandleBox = await boxOf(forestHandle(ctx.page, "S-1", "top"));
    await ctx.page.mouse.click(
      memberHandleBox.x + memberHandleBox.width / 2,
      (groupWindowBox.y + memberHandleBox.y) / 2,
    );

    await deleteDependencyViaPopup(ctx.page);

    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "s-out-outside")?.dependsOn,
      { timeout: 10000 },
    ).toBeUndefined();
    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-external-dependency"]').count(),
      { timeout: 10000 },
    ).toBe(0);
  }, 120000);

  it("deletes a dependency projected onto a collapsed Group", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fg-delete-projected",
      tickets: [
        { number: "S-1", title: "First member", memberOf: "S-G" },
        { number: "S-2", title: "Second member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside", dependsOn: ["S-1", "S-2"] },
      ],
    });

    const dependency = ctx.page.locator('[data-testid="forest-dependency"]');
    await dependency.waitFor({ state: "attached", timeout: 10000 });
    await ctx.page.waitForTimeout(300);
    const clickPoint = await pathScreenPoint(dependency, "middle");
    await ctx.page.mouse.click(clickPoint.x, clickPoint.y);

    await deleteDependencyViaPopup(ctx.page);

    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "s-out-outside")?.dependsOn,
      { timeout: 10000 },
    ).toBeUndefined();
    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-dependency"]').count(),
      { timeout: 10000 },
    ).toBe(0);
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
