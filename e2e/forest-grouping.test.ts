import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  setupE2E, readTicketStatus, listTicketFolders,
} from "./fixtures.js";
import {
  boxOf, centerOf, clickHandle, deleteDependencyViaPopup, forestCard, forestGroupCard,
  forestHandle, forestSurface, groupViaDialog, openForestProject, openSubforest,
  closeSubforest, pathScreenEndpoints, pathScreenPoint, shiftDragSelection,
  subforestCloseButton, toggleToForest,
} from "./forest-helpers.js";

describe("Forest Grouping", () => {
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

  it("sub-forest opens and closes", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-sub",
      tickets: [
        { number: "S-1", title: "Member One", memberOf: "S-G" },
        { number: "S-2", title: "Member Two", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
      ],
    });

    await forestGroupCard(ctx.page).waitFor({ state: "visible", timeout: 15000 });
    await openSubforest(ctx.page);
    await closeSubforest(ctx.page);
    expect(await subforestCloseButton(ctx.page).count()).toBe(0);
  }, 120000);

  it("centers only the tickets inside the open Group", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-center-scope",
      tickets: [
        { number: "S-1", title: "First member", memberOf: "S-G" },
        { number: "S-2", title: "Second member", memberOf: "S-G" },
        { number: "S-G", title: "Target Group" },
        { number: "O-1", title: "Distant member", memberOf: "O-G" },
        { number: "O-G", title: "Other Group" },
      ],
      layout: {
        "S-1": { x: 0, y: 0 },
        "S-2": { x: 300, y: 0 },
        "S-G": { x: 2500, y: 0 },
        "O-G": { x: 2800, y: 0 },
        "O-1": { x: 5000, y: 0 },
      },
    });

    await openSubforest(ctx.page, "S-G");
    const subforest = ctx.page.locator('[data-testid="forest-subforest-backdrop"]');
    const surface = subforest.locator('[data-testid="forest-surface"]');

    await ctx.page.waitForTimeout(300);
    await surface.locator('[data-testid="forest-center-button"]').click();

    const surfaceBox = await boxOf(surface);
    const cardBoxes = await subforest.locator('[data-testid="forest-ticket-card"]')
      .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    expect(cardBoxes).toHaveLength(2);
    const left = Math.min(...cardBoxes.map(box => box.x));
    const right = Math.max(...cardBoxes.map(box => box.x + box.width));
    expect((left + right) / 2).toBeCloseTo(surfaceBox.x + surfaceBox.width / 2, 0);
  }, 120000);

  it("keeps internal and external connectors attached after a Group finishes opening", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-open-connector-alignment",
      tickets: [
        {
          number: "S-1",
          title: "A dependent title long enough to wrap onto another line",
          memberOf: "S-G",
          dependsOn: ["S-2"],
        },
        {
          number: "S-2",
          title: "A dependency title long enough to wrap onto another line",
          memberOf: "S-G",
        },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside", dependsOn: ["S-1"] },
      ],
      layout: {
        "S-1": { x: -166.6666259765625, y: -245.33331298828125 },
        "S-2": { x: 221.3333740234375, y: -64 },
      },
    });

    await openSubforest(ctx.page, "S-G");
    await ctx.page.waitForTimeout(500);

    const dependentBox = await boxOf(forestCard(ctx.page, "S-1"));
    const dependencyBox = await boxOf(forestCard(ctx.page, "S-2"));
    expect(dependentBox.height).toBeGreaterThan(72);
    expect(dependencyBox.height).toBeGreaterThan(72);

    const internalEndpoints = await pathScreenEndpoints(ctx.page.locator(
      '[data-testid="forest-subforest-backdrop"] [data-testid="forest-dependency"]',
    ));
    expect(internalEndpoints.start.x).toBeCloseTo(dependentBox.x + dependentBox.width / 2, 1);
    expect(internalEndpoints.start.y).toBeCloseTo(dependentBox.y + dependentBox.height, 1);
    expect(internalEndpoints.end.x).toBeCloseTo(dependencyBox.x + dependencyBox.width / 2, 1);
    expect(internalEndpoints.end.y).toBeCloseTo(dependencyBox.y, 1);

    const externalEndpoints = await pathScreenEndpoints(ctx.page.locator(
      '[data-testid="forest-subforest-backdrop"] [data-testid="forest-external-dependency"]',
    ));
    expect(externalEndpoints.start.x).toBeCloseTo(dependentBox.x + dependentBox.width / 2, 1);
    expect(externalEndpoints.start.y).toBeCloseTo(dependentBox.y, 1);
  }, 120000);

  it("attaches pre-existing external lines to the Group window after opening", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-open-down-line",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G", dependsOn: ["S-OUT"] },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside" },
      ],
      layout: {
        "S-1": { x: 0, y: 0 },
        "S-G": { x: 0, y: -160 },
        "S-OUT": { x: 248, y: 0 },
      },
    });

    await openSubforest(ctx.page, "S-G");
    await ctx.page.waitForTimeout(500);

    const memberBox = await boxOf(forestCard(ctx.page, "S-1"));
    const windowBox = await boxOf(subforestCloseButton(ctx.page).locator(".."));
    const endpoints = await pathScreenEndpoints(
      ctx.page.locator('[data-testid="forest-external-dependency"]'),
    );
    const top = Math.min(endpoints.start.y, endpoints.end.y);
    const bottom = Math.max(endpoints.start.y, endpoints.end.y);
    expect(Math.abs(top - (memberBox.y + memberBox.height))).toBeLessThan(4);
    expect(Math.abs(bottom - (windowBox.y + windowBox.height))).toBeLessThan(4);
  }, 120000);

  it("keeps external lines attached to their member on every frame while the Group opens", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-open-line-frames",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G", dependsOn: ["S-OUT"] },
        { number: "S-G", title: "Group" },
        { number: "S-OUT", title: "Outside" },
      ],
      layout: {
        "S-1": { x: 0, y: 0 },
        "S-G": { x: 0, y: -160 },
        "S-OUT": { x: 248, y: 0 },
      },
    });

    await ctx.page.evaluate(() => {
      const samples: { dx: number; dy: number; dyEnd: number }[] = [];
      (window as unknown as { __lineSamples: unknown }).__lineSamples = samples;
      const deadline = performance.now() + 2000;
      const sample = () => {
        const path = document.querySelector<SVGPathElement>(
          '[data-testid="forest-subforest-backdrop"] [data-testid="forest-external-dependency"]',
        );
        const card = document.querySelector(
          '[data-testid="forest-subforest-backdrop"] [data-testid="forest-ticket-card"][data-ticket-number="S-1"]',
        );
        const boundary = document.querySelector("[data-forest-connection-boundary]");
        const matrix = path?.getScreenCTM();
        if (path && card && boundary && matrix) {
          const toScreen = (p: DOMPoint) => ({
            x: matrix.a * p.x + matrix.c * p.y + matrix.e,
            y: matrix.b * p.x + matrix.d * p.y + matrix.f,
          });
          const start = toScreen(path.getPointAtLength(0));
          const end = toScreen(path.getPointAtLength(path.getTotalLength()));
          const rect = card.getBoundingClientRect();
          const boundaryRect = boundary.getBoundingClientRect();
          samples.push({
            dx: start.x - (rect.x + rect.width / 2),
            dy: start.y - rect.bottom,
            dyEnd: end.y - boundaryRect.bottom,
          });
        }
        if (performance.now() < deadline) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await forestGroupCard(ctx.page, "S-G").click();
    await ctx.page.waitForTimeout(1200);
    const samples = await ctx.page.evaluate(
      () => (window as unknown as {
        __lineSamples: { dx: number; dy: number; dyEnd: number }[];
      }).__lineSamples,
    );

    expect(samples.length).toBeGreaterThan(5);
    for (const sample of samples) {
      expect(Math.abs(sample.dx)).toBeLessThan(5);
      expect(Math.abs(sample.dy)).toBeLessThan(5);
      expect(Math.abs(sample.dyEnd)).toBeLessThan(5);
    }
  }, 120000);

  it("clicking outside an open Group closes it", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-outside-close",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
      ],
    });

    await openSubforest(ctx.page);
    const backdropBox = await boxOf(ctx.page.locator('[data-testid="forest-subforest-backdrop"]'));

    await ctx.page.mouse.click(backdropBox.x + 10, backdropBox.y + 10);

    await subforestCloseButton(ctx.page).waitFor({ state: "detached", timeout: 10000 });
  }, 120000);

  it("opening and closing a Group preserves connection mode", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-close-connection",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
      ],
    });

    await clickHandle(ctx.page, "S-G", "bottom");
    const rootSurface = forestSurface(ctx.page).first();
    expect(await rootSurface.getAttribute("data-connection-edit-mode")).toBe("active");

    await openSubforest(ctx.page, "S-G");
    expect(await rootSurface.getAttribute("data-connection-edit-mode")).toBe("active");
    await closeSubforest(ctx.page);

    expect(await rootSurface.getAttribute("data-connection-edit-mode")).toBe("active");
    const preview = ctx.page.locator('[data-testid="forest-connection-preview"]');
    expect(await preview.count()).toBe(1);
    const surfaceBox = await boxOf(rootSurface);
    const pointer = {
      x: surfaceBox.x + surfaceBox.width * 0.25,
      y: surfaceBox.y + surfaceBox.height * 0.25,
    };
    await ctx.page.mouse.move(pointer.x, pointer.y);
    const endpoint = await pathScreenPoint(preview, "end");
    expect(Math.hypot(endpoint.x - pointer.x, endpoint.y - pointer.y)).toBeLessThan(4);
  }, 120000);

  it("reattaches an active member connector after closing its Group", async () => {
    await openForestProject(ctx, {
      slugBase: "fg-close-member-connection",
      tickets: [
        { number: "S-1", title: "Member", memberOf: "S-G" },
        { number: "S-G", title: "Group" },
      ],
    });

    await openSubforest(ctx.page, "S-G");
    await forestCard(ctx.page, "S-1").hover();
    const memberHandleCenter = await centerOf(forestHandle(ctx.page, "S-1", "bottom"));
    await ctx.page.mouse.click(memberHandleCenter.x, memberHandleCenter.y);

    await closeSubforest(ctx.page);
    const surfaceBox = await boxOf(forestSurface(ctx.page).first());
    const pointer = {
      x: surfaceBox.x + surfaceBox.width * 0.25,
      y: surfaceBox.y + surfaceBox.height * 0.25,
    };
    await ctx.page.mouse.move(pointer.x, pointer.y);

    const endpoints = await pathScreenEndpoints(
      ctx.page.locator('[data-testid="forest-connection-preview"]'),
    );
    const groupHandle = forestHandle(ctx.page, "S-G", "bottom");
    expect(await groupHandle.getAttribute("data-connection-handle-state")).toBe("source");
    const expectedStart = await centerOf(groupHandle);

    expect(Math.hypot(endpoints.end.x - pointer.x, endpoints.end.y - pointer.y)).toBeLessThan(4);
    expect(Math.hypot(
      endpoints.start.x - expectedStart.x,
      endpoints.start.y - expectedStart.y,
    )).toBeLessThan(4);
  }, 120000);

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
    await ctx.page.waitForTimeout(1500);

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
