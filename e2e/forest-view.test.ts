import { describe, it, expect } from "vitest";
import {
  setupE2E, readTicketStatus, readForestLayout, getLocalStorageItem,
} from "./fixtures.js";
import {
  boxCenter, boxOf, centerOf, clickHandle, deleteDependencyViaPopup, dragPointer,
  forestCard, forestHandle, forestSurface, openForestProject, pathScreenEndpoints,
  pathScreenPoint, toggleToForest, toggleToKanban,
} from "./forest-helpers.js";

describe("Forest View", () => {
  const ctx = setupE2E();

  it("uses the logs stroke width with square integer-grid rectangles", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-icon-stroke",
      tickets: [{ number: "A-1", title: "First" }],
      view: "kanban",
    });

    const readStrokeStyle = (testId: string) => ctx.page.locator(
      `[data-testid="${testId}"] svg`,
    ).evaluate((svg) => {
      const style = getComputedStyle(svg);
      return {
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
      };
    });

    expect(await readStrokeStyle("project-header-forest-toggle-button"))
      .toEqual(await readStrokeStyle("project-header-logs-button"));
    const rectangles = await ctx.page.locator(
      '[data-testid="project-header-forest-toggle-button"] svg',
    ).evaluate((svg) => {
      return Array.from(svg.querySelectorAll("rect"), rect => ({
        x: rect.x.baseVal.value,
        y: rect.y.baseVal.value,
        width: rect.width.baseVal.value,
        height: rect.height.baseVal.value,
        rounded: rect.hasAttribute("rx") || rect.hasAttribute("ry"),
      }));
    });

    expect(rectangles).toHaveLength(3);
    for (const rectangle of rectangles) {
      expect(rectangle.rounded).toBe(false);
      expect([rectangle.x, rectangle.y, rectangle.width, rectangle.height]
        .every(Number.isInteger)).toBe(true);
    }
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
    await ctx.page.waitForTimeout(500);

    const layout = readForestLayout(ctx.testServer, project.projectSlug);
    expect(layout).toBeTruthy();
    expect(layout!["A-1"]).toBeDefined();
    expect(layout!["B-1"]).toBeDefined();
    expect(layout!["C-1"]).toBeDefined();
  }, 120000);

  it("centers the full forest horizontally at the bottom-middle of the surface", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-center",
      tickets: [
        { number: "A-1", title: "First", folderName: "a-1-first" },
        { number: "B-1", title: "Second", folderName: "b-1-second" },
        { number: "C-1", title: "Third", folderName: "c-1-third", dependsOn: ["A-1"] },
        { number: "D-1", title: "Fourth", folderName: "d-1-fourth", dependsOn: ["C-1"] },
      ],
      layout: {
        "A-1": { x: 0, y: 0 },
        "B-1": { x: 300, y: 0 },
        "C-1": { x: 900, y: -160 },
        "D-1": { x: 900, y: -320 },
      },
    });

    const rearrangeButton = ctx.page.locator('[data-testid="forest-rearrange-button"]');
    const centerButton = ctx.page.locator('[data-testid="forest-center-button"]');
    const surfaceBox = await boxOf(forestSurface(ctx.page));

    await dragPointer(
      ctx.page,
      { x: surfaceBox.x + surfaceBox.width - 30, y: surfaceBox.y + surfaceBox.height - 30 },
      { x: surfaceBox.x + surfaceBox.width - 230, y: surfaceBox.y + surfaceBox.height - 180 },
      { steps: 1, stepDelayMs: 0 },
    );
    await centerButton.click();

    const cardBoxes = await ctx.page.locator('[data-testid="forest-ticket-card"]')
      .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    const left = Math.min(...cardBoxes.map(box => box.x));
    const right = Math.max(...cardBoxes.map(box => box.x + box.width));
    const bottom = Math.max(...cardBoxes.map(box => box.y + box.height));
    expect((left + right) / 2).toBeCloseTo(surfaceBox.x + surfaceBox.width / 2, 0);
    expect(surfaceBox.y + surfaceBox.height - bottom).toBeCloseTo(120, 0);

    const rearrangeBox = await boxOf(rearrangeButton);
    const centerBox = await boxOf(centerButton);
    expect(centerBox.x - rearrangeBox.x - rearrangeBox.width).toBeCloseTo(16, 0);
  }, 120000);

  it("viewport persistence across reload", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-vp",
      tickets: [{ number: "V-1", title: "Viewport", folderName: "v-1-viewport" }],
    });

    await dragPointer(ctx.page, { x: 600, y: 400 }, { x: 800, y: 500 });
    await ctx.page.waitForTimeout(500);

    await ctx.page.reload();
    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });

    const vpStr = await getLocalStorageItem(ctx.page, `forest-viewport:${project.projectSlug}`);
    expect(vpStr).toBeTruthy();
    const vp = JSON.parse(vpStr!);
    expect(typeof vp.x).toBe("number");
    expect(typeof vp.y).toBe("number");
    expect(typeof vp.zoom).toBe("number");
  }, 120000);

  it("keeps a panned Forest in place when switching to kanban and back", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-toggle-vp",
      tickets: [{ number: "P-1", title: "Panned", folderName: "p-1-panned" }],
    });

    const card = forestCard(ctx.page, "P-1");
    const surfaceBox = await boxOf(forestSurface(ctx.page));

    const start = {
      x: surfaceBox.x + surfaceBox.width - 40,
      y: surfaceBox.y + surfaceBox.height - 40,
    };
    await dragPointer(ctx.page, start, { x: start.x - 180, y: start.y - 110 }, { steps: 1, stepDelayMs: 0 });
    await ctx.page.waitForTimeout(500);

    const beforeToggle = await boxOf(card);

    await toggleToKanban(ctx.page);
    await toggleToForest(ctx.page);

    const afterToggle = await boxOf(card);
    expect(afterToggle.x).toBeCloseTo(beforeToggle.x, 0);
    expect(afterToggle.y).toBeCloseTo(beforeToggle.y, 0);
  }, 120000);

  it("shows the default cursor at idle and grabbing while panning", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-pan-cursor",
      tickets: [{ number: "P-1", title: "Pan", folderName: "p-1-pan" }],
    });

    const pane = forestSurface(ctx.page).locator(".solid-flow__pane");
    const surfaceBox = await boxOf(forestSurface(ctx.page));
    const start = {
      x: surfaceBox.x + surfaceBox.width - 30,
      y: surfaceBox.y + surfaceBox.height - 30,
    };

    await ctx.page.mouse.move(start.x, start.y);
    const idleCursor = await pane.evaluate((element) => getComputedStyle(element).cursor);
    expect(idleCursor).toBe("default");

    await ctx.page.mouse.down();
    await ctx.page.mouse.move(start.x - 40, start.y - 20);
    const panningCursor = await pane.evaluate((element) => getComputedStyle(element).cursor);
    await ctx.page.mouse.up();

    expect(panningCursor).toBe("grabbing");
  }, 120000);

  it("selection rect is rendered during shift-drag", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-sel",
      tickets: [
        { number: "S-1", title: "Select1", folderName: "s-1-select1" },
        { number: "S-2", title: "Select2", folderName: "s-2-select2" },
      ],
    });

    const surfaceBox = await boxOf(forestSurface(ctx.page));
    const sx = surfaceBox.x + surfaceBox.width / 2;
    const sy = surfaceBox.y + surfaceBox.height / 2;

    await ctx.page.keyboard.down("Shift");
    await ctx.page.mouse.move(sx - 200, sy - 100);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await ctx.page.mouse.move(sx - 200 + i * 40, sy - 100 + i * 20);
      await ctx.page.waitForTimeout(20);
    }
    await ctx.page.waitForTimeout(200);

    const selRect = ctx.page.locator('.solid-flow__selection');
    expect(await selRect.count()).toBeGreaterThanOrEqual(1);

    await ctx.page.mouse.up();
    await ctx.page.keyboard.up("Shift");
  }, 120000);

  it("places both connector handles on the hovered card edges", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-htop",
      tickets: [{ number: "H-1", title: "HandleTop", folderName: "h-1-handletop" }],
    });

    const card = forestCard(ctx.page, "H-1");
    await card.waitFor({ state: "visible", timeout: 15000 });
    const center = await centerOf(card);
    await ctx.page.mouse.move(center.x, center.y);
    await ctx.page.waitForTimeout(200);

    const geometry = await card.evaluate((element) => {
      const cardRect = element.getBoundingClientRect();
      const handles = Array.from(
        element.querySelectorAll<HTMLElement>("[data-connection-handle-end]"),
        handle => {
          const rect = handle.getBoundingClientRect();
          return {
            end: handle.dataset.connectionHandleEnd,
            centerY: rect.top + rect.height / 2,
          };
        },
      );
      return {
        edges: { top: cardRect.top, bottom: cardRect.bottom },
        handles,
      };
    });

    expect(geometry.handles).toHaveLength(2);
    for (const handle of geometry.handles) {
      expect(handle.end === "top" || handle.end === "bottom").toBe(true);
      expect(handle.centerY).toBeCloseTo(geometry.edges[handle.end as "top" | "bottom"], 0);
    }
  }, 120000);

  it("clicking blank surface content exits connection mode", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-cancel-connection",
      tickets: [{ number: "A-1", title: "Alpha", folderName: "a-1-alpha" }],
    });

    await clickHandle(ctx.page, "A-1", "bottom");

    const surface = forestSurface(ctx.page);
    expect(await surface.getAttribute("data-connection-edit-mode")).toBe("active");
    const cardGutter = await boxOf(forestCard(ctx.page, "A-1").locator(".."));
    await ctx.page.mouse.click(cardGutter.x + 12, cardGutter.y + 2);

    expect(await surface.getAttribute("data-connection-edit-mode")).toBeNull();
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);
  }, 120000);

  it("Escape exits connection mode", async () => {
    await openForestProject(ctx, {
      slugBase: "fv-escape-connection",
      tickets: [{ number: "A-1", title: "Alpha", folderName: "a-1-alpha" }],
    });

    await clickHandle(ctx.page, "A-1", "bottom");
    const surface = forestSurface(ctx.page);
    expect(await surface.getAttribute("data-connection-edit-mode")).toBe("active");

    await ctx.page.keyboard.press("Escape");

    expect(await surface.getAttribute("data-connection-edit-mode")).toBeNull();
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);
  }, 120000);

  it("exits connection mode after connecting or clicking empty space", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-connection-mode",
      tickets: [
        { number: "A-1", title: "Alpha", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", folderName: "b-1-beta" },
      ],
    });

    await clickHandle(ctx.page, "A-1", "bottom");
    const sourceHandle = forestHandle(ctx.page, "A-1", "bottom");
    const targetHandle = forestHandle(ctx.page, "B-1", "top");
    expect(await sourceHandle.getAttribute("data-connection-handle-state")).toBe("source");
    expect(await targetHandle.getAttribute("data-connection-handle-state")).toBe("available");
    expect(await forestHandle(ctx.page, "A-1", "top")
      .getAttribute("data-connection-handle-state")).toBe("hidden");
    expect(await forestHandle(ctx.page, "B-1", "bottom")
      .getAttribute("data-connection-handle-state")).toBe("hidden");
    const preview = ctx.page.locator('[data-testid="forest-connection-preview"]');
    expect(await preview.count()).toBe(1);
    const initialPreviewPath = await preview.getAttribute("d");
    const sourceBox = await boxOf(forestCard(ctx.page, "A-1"));
    await ctx.page.mouse.move(sourceBox.x + sourceBox.width + 40, sourceBox.y + sourceBox.height / 2);
    await expect.poll(() => preview.getAttribute("d")).not.toBe(initialPreviewPath);

    await targetHandle.click();
    await expect.poll(
      () => readTicketStatus(ctx.testServer, project.projectSlug, "a-1-alpha")?.dependsOn,
      { timeout: 10000 },
    ).toContain("B-1");

    const surface = forestSurface(ctx.page);
    await expect.poll(
      () => surface.getAttribute("data-connection-edit-mode"),
      { timeout: 10000 },
    ).toBeNull();
    expect(await sourceHandle.getAttribute("data-connection-handle-state")).toBe("hidden");
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);

    await clickHandle(ctx.page, "A-1", "bottom");
    expect(await surface.getAttribute("data-connection-edit-mode")).toBe("active");

    const surfaceBox = await boxOf(surface);
    await ctx.page.mouse.click(surfaceBox.x + surfaceBox.width - 24, surfaceBox.y + surfaceBox.height - 24);

    expect(await sourceHandle.getAttribute("data-connection-handle-state")).toBe("hidden");
  }, 120000);
}, 120000);
