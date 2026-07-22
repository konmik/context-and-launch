import { describe, it, expect } from "vitest";
import {
  setupE2E, readTicketStatus, readForestLayout, getLocalStorageItem, poll,
} from "./fixtures.js";
import {
  boxCenter, boxOf, centerOf, clickHandle, deleteDependencyViaPopup, dragPointer,
  forestCard, forestHandle, forestSurface, openForestProject, pathScreenEndpoints,
  pathScreenPoint, toggleToForest, toggleToKanban,
} from "./forest-helpers.js";

describe("Forest View", () => {
  const ctx = setupE2E();

  it("renders the forest toggle and logs icons with consistent lucide styling", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-icon-stroke",
      tickets: [{ number: "A-1", title: "First" }],
      view: "kanban",
    });

    const readIcon = (testId: string) => ctx.page.locator(
      `[data-testid="${testId}"] svg`,
    ).evaluate((svg) => {
      const style = getComputedStyle(svg);
      return {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        isLucide: svg.classList.contains("lucide"),
        width: svg.getAttribute("width"),
        height: svg.getAttribute("height"),
      };
    });

    const forestIcon = await readIcon("project-header-forest-toggle-button");
    const logsIcon = await readIcon("project-header-logs-button");
    expect(forestIcon).toEqual(logsIcon);
    expect(forestIcon.isLucide).toBe(true);
    expect(forestIcon.width).toBe("16");
    expect(forestIcon.height).toBe("16");
  }, 120000);

  it("fills the viewport so the surface, controls, and cards render", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-height",
      tickets: [{ number: "A-1", title: "First", folderName: "a-1-first" }],
    });

    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });

    const viewport = ctx.page.viewportSize();
    expect(viewport).toBeTruthy();
    const surfaceBox = await boxOf(forestSurface(ctx.page));
    expect(surfaceBox.height).toBeGreaterThan(viewport!.height / 2);

    await ctx.page.locator('[data-testid="forest-close-button"]')
      .waitFor({ state: "visible", timeout: 15000 });
    const selectHint = ctx.page.locator('[data-testid="forest-select-hint"]');
    await selectHint.waitFor({ state: "visible", timeout: 15000 });
    expect(await selectHint.textContent()).toBe("Shift+mouse to select");
    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(1);
  }, 120000);

  it("toggle + persistence", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-toggle",
      tickets: [
        { number: "A-1", title: "First", folderName: "a-1-first" },
        { number: "B-1", title: "Second", folderName: "b-1-second", dependsOn: ["A-1"] },
        { number: "C-1", title: "Third", folderName: "c-1-third", dependsOn: ["A-1", "B-1"] },
      ],
    });

    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(3);

    const viewMode = await getLocalStorageItem(ctx.page, `view-mode:${project.projectSlug}`);
    expect(viewMode).toBe("forest");

    await ctx.page.reload();
    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });
    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(3);

    expect(await ctx.page.locator('[data-testid="project-header-logs-button"]').count()).toBe(1);

    await toggleToKanban(ctx.page);
  }, 120000);

  it("layer placement: dependent above dependency", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-layer",
      tickets: [
        { number: "A-1", title: "Base", folderName: "a-1-base" },
        { number: "B-1", title: "Mid", folderName: "b-1-mid", dependsOn: ["A-1"] },
        { number: "C-1", title: "Top", folderName: "c-1-top", dependsOn: ["A-1", "B-1"] },
      ],
    });

    await ctx.page.click('[data-testid="forest-rearrange-button"]');
    await ctx.page.waitForTimeout(500);

    await forestCard(ctx.page, "A-1").waitFor({ state: "visible", timeout: 15000 });
    const boxA = await boxOf(forestCard(ctx.page, "A-1"));
    const boxB = await boxOf(forestCard(ctx.page, "B-1"));
    const boxC = await boxOf(forestCard(ctx.page, "C-1"));

    expect(boxC.y).toBeLessThan(boxB.y);
    expect(boxB.y).toBeLessThan(boxA.y);
  }, 120000);

  it("connectors meet cards whose content makes them taller than the minimum height", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-variable-card-height",
      tickets: [
        {
          number: "A-1",
          title: "A dependency title long enough to wrap onto a second line",
          folderName: "a-1-dependency",
        },
        {
          number: "B-1",
          title: "A dependent title long enough to wrap onto a second line",
          folderName: "b-1-dependent",
          dependsOn: ["A-1"],
        },
      ],
    });

    const dependencyPath = ctx.page.locator(
      '[data-testid="forest-dependency"][data-from="B-1"][data-to="A-1"]',
    );
    await dependencyPath.waitFor({ state: "attached", timeout: 15000 });

    const dependencyBox = await boxOf(forestCard(ctx.page, "A-1"));
    const dependentBox = await boxOf(forestCard(ctx.page, "B-1"));
    expect(dependencyBox.height).toBeGreaterThan(72);
    expect(dependentBox.height).toBeGreaterThan(72);

    const endpoints = await pathScreenEndpoints(dependencyPath);
    expect(endpoints.start.x).toBeCloseTo(dependentBox.x + dependentBox.width / 2, 1);
    expect(endpoints.start.y).toBeCloseTo(dependentBox.y + dependentBox.height, 1);
    expect(endpoints.end.x).toBeCloseTo(dependencyBox.x + dependencyBox.width / 2, 1);
    expect(endpoints.end.y).toBeCloseTo(dependencyBox.y, 1);
  }, 120000);

  it("connects on a target handle and cancels a drag released on empty space", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-dep",
      tickets: [
        { number: "A-1", title: "Alpha", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", folderName: "b-1-beta" },
      ],
    });

    await forestCard(ctx.page, "B-1").waitFor({ state: "visible", timeout: 15000 });
    const handle = forestHandle(ctx.page, "B-1", "bottom");
    await handle.waitFor({ state: "attached", timeout: 5000 });
    await handle.evaluate((el) => {
      (el as HTMLElement).style.opacity = '1';
      (el as HTMLElement).style.pointerEvents = 'auto';
    });

    const sourcePoint = await centerOf(handle);
    const targetBox = await boxOf(forestHandle(ctx.page, "A-1", "top"));
    const targetPoint = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + 2 };

    await dragPointer(ctx.page, sourcePoint, targetPoint);
    await expect.poll(
      () => readTicketStatus(
        ctx.testServer, project.projectSlug, "b-1-beta",
      )?.dependsOn?.includes("A-1") ?? false,
      { timeout: 10000 },
    ).toBe(true);

    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-dependency"]').count(),
      { timeout: 10000 },
    ).toBeGreaterThanOrEqual(1);
    expect(await ctx.page.locator('[data-connection-edit-mode="active"]').count()).toBe(0);

    const surfaceBox = await boxOf(forestSurface(ctx.page));
    const movedSourcePoint = await centerOf(handle);
    await ctx.page.mouse.move(movedSourcePoint.x, movedSourcePoint.y);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(surfaceBox.x + surfaceBox.width - 24, surfaceBox.y + surfaceBox.height - 24);
    await ctx.page.mouse.up();

    expect(await ctx.page.locator('[data-connection-edit-mode="active"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);
  }, 120000);

  it("cycle rejection", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-cycle",
      tickets: [
        { number: "A-1", title: "Alpha", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", folderName: "b-1-beta", dependsOn: ["A-1"] },
      ],
    });

    const aCard = forestCard(ctx.page, "A-1");
    await aCard.waitFor({ state: "visible", timeout: 15000 });
    const cardCenter = await centerOf(aCard);
    await ctx.page.mouse.move(cardCenter.x, cardCenter.y);
    await ctx.page.waitForTimeout(200);

    const handle = ctx.page.locator('[data-testid="forest-handle-bottom"]').first();
    await handle.waitFor({ state: "visible", timeout: 5000 });

    const handlePoint = await centerOf(handle);
    const targetPoint = await centerOf(forestCard(ctx.page, "B-1"));
    await dragPointer(ctx.page, handlePoint, targetPoint);
    await ctx.page.waitForTimeout(500);

    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', { state: "visible", timeout: 10000 });
    await ctx.page.click('[data-testid="error-dialog-ok"]');

    const status = readTicketStatus(ctx.testServer, project.projectSlug, "a-1-alpha");
    expect(status?.dependsOn).toBeUndefined();
  }, 120000);

  it("deleting a dependency removes its line immediately", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-deldep",
      tickets: [
        { number: "A-1", title: "Alpha", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", folderName: "b-1-beta", dependsOn: ["A-1"] },
      ],
    });

    const edge = ctx.page.locator('[data-testid="forest-dependency"]').first();
    await edge.waitFor({ state: "attached", timeout: 15000 });
    await ctx.page.waitForTimeout(300);
    const edgePoint = await pathScreenPoint(edge, "middle");
    await ctx.page.mouse.click(edgePoint.x, edgePoint.y);

    await deleteDependencyViaPopup(ctx.page);
    await ctx.page.locator('[data-testid="forest-dependency-delete"]')
      .waitFor({ state: "detached", timeout: 10000 });

    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "b-1-beta")?.dependsOn,
      { timeout: 10000 },
    ).toBeUndefined();

    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-dependency"]').count(),
      { timeout: 10000 },
    ).toBe(0);
  }, 120000);

  it("drag card persists to forest-layout.json", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-drag",
      tickets: [
        { number: "D-1", title: "Draggable", folderName: "d-1-draggable" },
        { number: "T-1", title: "Target", folderName: "t-1-target" },
      ],
    });

    const card = forestCard(ctx.page, "D-1");
    await card.waitFor({ state: "visible", timeout: 15000 });
    const start = await centerOf(card);
    await dragPointer(ctx.page, start, { x: start.x + 150, y: start.y }, { steps: 15, stepDelayMs: 20 });

    await expect.poll(
      () => readForestLayout(ctx.testServer, project.projectSlug)?.["D-1"],
      { timeout: 10000 },
    ).toEqual({ x: expect.any(Number), y: expect.any(Number) });

    const movedBox = await boxOf(card);
    await clickHandle(ctx.page, "D-1", "bottom");
    await forestHandle(ctx.page, "T-1", "top").click();
    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "d-1-draggable")?.dependsOn,
      { timeout: 10000 },
    ).toContain("T-1");
    await expect.poll(async () => (await card.boundingBox())?.x).toBeCloseTo(movedBox.x, 0);
  }, 120000);

  it("does not remount the forest after a drag persists", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-noremount",
      tickets: [{ number: "D-1", title: "Draggable", folderName: "d-1-draggable" }],
    });

    const card = forestCard(ctx.page, "D-1");
    await card.waitFor({ state: "visible", timeout: 15000 });
    const wrapper = await ctx.page.locator('[data-testid="solid-flow__wrapper"]').elementHandle();
    expect(wrapper).toBeTruthy();

    const start = await centerOf(card);
    await dragPointer(ctx.page, start, { x: start.x + 150, y: start.y }, { steps: 15, stepDelayMs: 20 });

    await expect.poll(
      () => readForestLayout(ctx.testServer, project.projectSlug)?.["D-1"],
      { timeout: 10000 },
    ).toEqual({ x: expect.any(Number), y: expect.any(Number) });

    const stillConnected = await wrapper!.evaluate((element) => element.isConnected);
    expect(stillConnected).toBe(true);
  }, 120000);

  it("rearrange writes all positions to forest-layout.json", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-rearr",
      tickets: [
        { number: "A-1", title: "First", folderName: "a-1-first" },
        { number: "B-1", title: "Second", folderName: "b-1-second", dependsOn: ["A-1"] },
        { number: "C-1", title: "Third", folderName: "c-1-third", dependsOn: ["A-1", "B-1"] },
      ],
    });

    await ctx.page.click('[data-testid="forest-rearrange-button"]');

    const layout = await poll(
      () => readForestLayout(ctx.testServer, project.projectSlug),
      (l) => !!l && !!l["A-1"] && !!l["B-1"] && !!l["C-1"],
      5000,
    );
    expect(layout).toBeTruthy();
    expect(layout!["A-1"]).toBeDefined();
    expect(layout!["B-1"]).toBeDefined();
    expect(layout!["C-1"]).toBeDefined();
  }, 120000);
}, 120000);
