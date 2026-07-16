import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  setupE2E, createProject, gotoProject, uniqueSlug,
  readTicketStatus, readForestLayout, getLocalStorageItem,
} from "./fixtures.js";

const boards = [{ id: "default", name: "Default", columns: [{ name: "todo" }, { name: "done" }] }];

describe("Forest View", () => {
  const ctx = setupE2E();

  async function toggleToForest(page: typeof ctx.page) {
    await page.click('[data-testid="project-header-forest-toggle-button"]');
    await page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });
  }

  it("uses the logs stroke width with square integer-grid rectangles", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fv-icon-stroke"),
      withBoards: boards,
      withTickets: [{ number: "A-1", title: "First", status: "todo" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

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
    const projectSlug = uniqueSlug("fv-toggle");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "First", status: "todo", folderName: "a-1-first" },
        { number: "B-1", title: "Second", status: "todo", folderName: "b-1-second", dependsOn: ["A-1"] },
        { number: "C-1", title: "Third", status: "todo", folderName: "c-1-third", dependsOn: ["A-1", "B-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const cardCount = await ctx.page.locator('[data-testid="forest-ticket-card"]').count();
    expect(cardCount).toBe(3);

    const viewMode = await getLocalStorageItem(ctx.page, `view-mode:${projectSlug}`);
    expect(viewMode).toBe("forest");

    await ctx.page.reload();
    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });
    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(3);

    expect(await ctx.page.locator('[data-testid="project-header-logs-button"]').count()).toBe(1);

    await ctx.page.click('[data-testid="project-header-forest-toggle-button"]');
    await ctx.page.waitForSelector('[data-testid="kanban-board-column-header"]', { state: "visible", timeout: 15000 });
  }, 120000);

  it("layer placement: dependent above dependency", async () => {
    const projectSlug = uniqueSlug("fv-layer");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Base", status: "todo", folderName: "a-1-base" },
        { number: "B-1", title: "Mid", status: "todo", folderName: "b-1-mid", dependsOn: ["A-1"] },
        { number: "C-1", title: "Top", status: "todo", folderName: "c-1-top", dependsOn: ["A-1", "B-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    await ctx.page.click('[data-testid="forest-rearrange-button"]');
    await ctx.page.waitForTimeout(500);

    const cardA = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="A-1"]');
    const cardB = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="B-1"]');
    const cardC = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="C-1"]');
    await cardA.waitFor({ state: "visible", timeout: 15000 });

    const boxA = await cardA.boundingBox();
    const boxB = await cardB.boundingBox();
    const boxC = await cardC.boundingBox();
    expect(boxA).toBeTruthy();
    expect(boxB).toBeTruthy();
    expect(boxC).toBeTruthy();

    expect(boxC!.y).toBeLessThan(boxB!.y);
    expect(boxB!.y).toBeLessThan(boxA!.y);
  }, 120000);

  it("connectors meet cards whose content makes them taller than the minimum height", async () => {
    const projectSlug = uniqueSlug("fv-variable-card-height");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        {
          number: "A-1",
          title: "A dependency title long enough to wrap onto a second line",
          status: "todo",
          folderName: "a-1-dependency",
        },
        {
          number: "B-1",
          title: "A dependent title long enough to wrap onto a second line",
          status: "todo",
          folderName: "b-1-dependent",
          dependsOn: ["A-1"],
        },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const dependencyCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="A-1"]',
    );
    const dependentCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="B-1"]',
    );
    const dependencyPath = ctx.page.locator(
      '[data-testid="forest-dependency"][data-from="B-1"][data-to="A-1"]',
    );
    await dependencyPath.waitFor({ state: "attached", timeout: 15000 });

    const dependencyBox = await dependencyCard.boundingBox();
    const dependentBox = await dependentCard.boundingBox();
    expect(dependencyBox).toBeTruthy();
    expect(dependentBox).toBeTruthy();
    expect(dependencyBox!.height).toBeGreaterThan(72);
    expect(dependentBox!.height).toBeGreaterThan(72);

    const endpoints = await dependencyPath.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Dependency line is not rendered on screen");
      const toScreen = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return {
        start: toScreen(svgPath.getPointAtLength(0)),
        end: toScreen(svgPath.getPointAtLength(svgPath.getTotalLength())),
      };
    });

    expect(endpoints.start.x).toBeCloseTo(dependentBox!.x + dependentBox!.width / 2, 1);
    expect(endpoints.start.y).toBeCloseTo(dependentBox!.y + dependentBox!.height, 1);
    expect(endpoints.end.x).toBeCloseTo(dependencyBox!.x + dependencyBox!.width / 2, 1);
    expect(endpoints.end.y).toBeCloseTo(dependencyBox!.y, 1);
  }, 120000);

  it("connects on a target handle and cancels a drag released on empty space", async () => {
    const projectSlug = uniqueSlug("fv-dep");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Alpha", status: "todo", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", status: "todo", folderName: "b-1-beta" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const bCard = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="B-1"]');
    await bCard.waitFor({ state: "visible", timeout: 15000 });
    const bBox = await bCard.boundingBox();
    expect(bBox).toBeTruthy();

    const handle = bCard.locator('xpath=..').locator('[data-testid="forest-handle-bottom"]');
    await handle.waitFor({ state: "attached", timeout: 5000 });
    await handle.evaluate((el) => {
      (el as HTMLElement).style.opacity = '1';
      (el as HTMLElement).style.pointerEvents = 'auto';
    });
    const hBox = await handle.boundingBox();
    expect(hBox).toBeTruthy();

    const targetHandle = ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="A-1"]',
    );
    const targetBox = await targetHandle.boundingBox();
    expect(targetBox).toBeTruthy();
    const sourcePoint = { x: hBox!.x + hBox!.width / 2, y: hBox!.y + hBox!.height / 2 };
    const targetPoint = {
      x: targetBox!.x + targetBox!.width / 2,
      y: targetBox!.y + 2,
    };

    await ctx.page.mouse.move(sourcePoint.x, sourcePoint.y);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await ctx.page.mouse.move(
        sourcePoint.x + (targetPoint.x - sourcePoint.x) * (i / 10),
        sourcePoint.y + (targetPoint.y - sourcePoint.y) * (i / 10),
      );
      await ctx.page.waitForTimeout(30);
    }
    await ctx.page.mouse.up();
    await expect.poll(
      () => readTicketStatus(
        ctx.testServer, projectSlug, "b-1-beta",
      )?.dependsOn?.includes("A-1") ?? false,
      { timeout: 10000 },
    ).toBe(true);

    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-dependency"]').count(),
      { timeout: 10000 },
    ).toBeGreaterThanOrEqual(1);
    expect(await ctx.page.locator('[data-connection-edit-mode="active"]').count()).toBe(0);

    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).toBeTruthy();
    const movedSourceBox = await handle.boundingBox();
    expect(movedSourceBox).toBeTruthy();
    const movedSourcePoint = {
      x: movedSourceBox!.x + movedSourceBox!.width / 2,
      y: movedSourceBox!.y + movedSourceBox!.height / 2,
    };
    await ctx.page.mouse.move(movedSourcePoint.x, movedSourcePoint.y);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(surfaceBox!.x + surfaceBox!.width - 24, surfaceBox!.y + surfaceBox!.height - 24);
    await ctx.page.mouse.up();

    expect(await ctx.page.locator('[data-connection-edit-mode="active"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);
  }, 120000);

  it("cycle rejection", async () => {
    const projectSlug = uniqueSlug("fv-cycle");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Alpha", status: "todo", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", status: "todo", folderName: "b-1-beta", dependsOn: ["A-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const aCard = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="A-1"]');
    await aCard.waitFor({ state: "visible", timeout: 15000 });
    const aBox = await aCard.boundingBox();
    expect(aBox).toBeTruthy();

    await ctx.page.mouse.move(aBox!.x + aBox!.width / 2, aBox!.y + aBox!.height / 2);
    await ctx.page.waitForTimeout(200);

    const handle = ctx.page.locator('[data-testid="forest-handle-bottom"]').first();
    await handle.waitFor({ state: "visible", timeout: 5000 });
    const hBox = await handle.boundingBox();
    expect(hBox).toBeTruthy();

    const bCard = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="B-1"]');
    const bBox = await bCard.boundingBox();
    expect(bBox).toBeTruthy();

    await ctx.page.mouse.move(hBox!.x + hBox!.width / 2, hBox!.y + hBox!.height / 2);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await ctx.page.mouse.move(
        hBox!.x + (bBox!.x + bBox!.width / 2 - hBox!.x) * (i / 10),
        hBox!.y + (bBox!.y + bBox!.height / 2 - hBox!.y) * (i / 10),
      );
      await ctx.page.waitForTimeout(30);
    }
    await ctx.page.mouse.up();
    await ctx.page.waitForTimeout(500);

    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', { state: "visible", timeout: 10000 });
    await ctx.page.click('[data-testid="error-dialog-ok"]');

    const status = readTicketStatus(ctx.testServer, projectSlug, "a-1-alpha");
    expect(status?.dependsOn).toBeUndefined();
  }, 120000);

  it("deleting a dependency removes its line immediately", async () => {
    const projectSlug = uniqueSlug("fv-deldep");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Alpha", status: "todo", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", status: "todo", folderName: "b-1-beta", dependsOn: ["A-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const edge = ctx.page.locator('[data-testid="forest-dependency"]').first();
    await edge.waitFor({ state: "attached", timeout: 15000 });
    await ctx.page.waitForTimeout(300);
    const edgePoint = await edge.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const point = svgPath.getPointAtLength(svgPath.getTotalLength() / 2);
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Dependency line is not rendered on screen");
      return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      };
    });
    await ctx.page.mouse.click(edgePoint.x, edgePoint.y);

    const deleteBtn = ctx.page.locator('[data-testid="forest-dependency-delete"]');
    await deleteBtn.waitFor({ state: "visible", timeout: 10000 });
    await deleteBtn.click();
    await deleteBtn.waitFor({ state: "detached", timeout: 10000 });

    await expect.poll(
      () => readTicketStatus(ctx.testServer, projectSlug, "b-1-beta")?.dependsOn,
      { timeout: 10000 },
    ).toBeUndefined();

    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-dependency"]').count(),
      { timeout: 10000 },
    ).toBe(0);
  }, 120000);

  it("drag card persists to forest-layout.json", async () => {
    const projectSlug = uniqueSlug("fv-drag");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "D-1", title: "Draggable", status: "todo", folderName: "d-1-draggable" },
        { number: "T-1", title: "Target", status: "todo", folderName: "t-1-target" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const card = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="D-1"]');
    await card.waitFor({ state: "visible", timeout: 15000 });
    const box = await card.boundingBox();
    expect(box).toBeTruthy();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await ctx.page.mouse.move(startX, startY);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 15; i++) {
      await ctx.page.mouse.move(startX + i * 10, startY);
      await ctx.page.waitForTimeout(20);
    }
    await ctx.page.mouse.up();

    await expect.poll(
      () => readForestLayout(ctx.testServer, projectSlug)?.["D-1"],
      { timeout: 10000 },
    ).toEqual({ x: expect.any(Number), y: expect.any(Number) });

    const movedBox = await card.boundingBox();
    expect(movedBox).toBeTruthy();
    await card.hover();
    await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="D-1"]',
    ).click();
    await ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="T-1"]',
    ).click();
    await expect.poll(
      () => readTicketStatus(ctx.testServer, projectSlug, "d-1-draggable")?.dependsOn,
      { timeout: 10000 },
    ).toContain("T-1");
    await expect.poll(async () => (await card.boundingBox())?.x).toBeCloseTo(movedBox!.x, 0);
  }, 120000);

  it("does not remount the forest after a drag persists", async () => {
    const projectSlug = uniqueSlug("fv-noremount");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "D-1", title: "Draggable", status: "todo", folderName: "d-1-draggable" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const card = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="D-1"]');
    await card.waitFor({ state: "visible", timeout: 15000 });
    const wrapper = await ctx.page.locator('[data-testid="solid-flow__wrapper"]').elementHandle();
    expect(wrapper).toBeTruthy();

    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    await ctx.page.mouse.move(startX, startY);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 15; i++) {
      await ctx.page.mouse.move(startX + i * 10, startY);
      await ctx.page.waitForTimeout(20);
    }
    await ctx.page.mouse.up();

    await expect.poll(
      () => readForestLayout(ctx.testServer, projectSlug)?.["D-1"],
      { timeout: 10000 },
    ).toEqual({ x: expect.any(Number), y: expect.any(Number) });

    const stillConnected = await wrapper!.evaluate((element) => element.isConnected);
    expect(stillConnected).toBe(true);
  }, 120000);

  it("rearrange writes all positions to forest-layout.json", async () => {
    const projectSlug = uniqueSlug("fv-rearr");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "First", status: "todo", folderName: "a-1-first" },
        { number: "B-1", title: "Second", status: "todo", folderName: "b-1-second", dependsOn: ["A-1"] },
        { number: "C-1", title: "Third", status: "todo", folderName: "c-1-third", dependsOn: ["A-1", "B-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    await ctx.page.click('[data-testid="forest-rearrange-button"]');
    await ctx.page.waitForTimeout(500);

    const layout = readForestLayout(ctx.testServer, projectSlug);
    expect(layout).toBeTruthy();
    expect(layout!["A-1"]).toBeDefined();
    expect(layout!["B-1"]).toBeDefined();
    expect(layout!["C-1"]).toBeDefined();
  }, 120000);

  it("centers the full forest horizontally at the bottom-middle of the surface", async () => {
    const projectSlug = uniqueSlug("fv-center");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "First", status: "todo", folderName: "a-1-first" },
        { number: "B-1", title: "Second", status: "todo", folderName: "b-1-second" },
        { number: "C-1", title: "Third", status: "todo", folderName: "c-1-third", dependsOn: ["A-1"] },
        { number: "D-1", title: "Fourth", status: "todo", folderName: "d-1-fourth", dependsOn: ["C-1"] },
      ],
    });
    ctx.projects.push(project);
    fs.writeFileSync(
      path.join(project.ticketsPath, "forest-layout.json"),
      JSON.stringify({
        "A-1": { x: 0, y: 0 },
        "B-1": { x: 300, y: 0 },
        "C-1": { x: 900, y: -160 },
        "D-1": { x: 900, y: -320 },
      }),
    );
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const rearrangeButton = ctx.page.locator('[data-testid="forest-rearrange-button"]');
    const centerButton = ctx.page.locator('[data-testid="forest-center-button"]');
    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).toBeTruthy();

    await ctx.page.mouse.move(
      surfaceBox!.x + surfaceBox!.width - 30,
      surfaceBox!.y + surfaceBox!.height - 30,
    );
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(
      surfaceBox!.x + surfaceBox!.width - 230,
      surfaceBox!.y + surfaceBox!.height - 180,
    );
    await ctx.page.mouse.up();
    await centerButton.click();

    const cardBoxes = await ctx.page.locator('[data-testid="forest-ticket-card"]')
      .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    const left = Math.min(...cardBoxes.map(box => box.x));
    const right = Math.max(...cardBoxes.map(box => box.x + box.width));
    const bottom = Math.max(...cardBoxes.map(box => box.y + box.height));
    expect((left + right) / 2).toBeCloseTo(surfaceBox!.x + surfaceBox!.width / 2, 0);
    expect(surfaceBox!.y + surfaceBox!.height - bottom).toBeCloseTo(120, 0);

    const rearrangeBox = await rearrangeButton.boundingBox();
    const centerBox = await centerButton.boundingBox();
    expect(rearrangeBox).toBeTruthy();
    expect(centerBox).toBeTruthy();
    expect(centerBox!.x - rearrangeBox!.x - rearrangeBox!.width).toBeCloseTo(16, 0);
  }, 120000);

  it("viewport persistence across reload", async () => {
    const projectSlug = uniqueSlug("fv-vp");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "V-1", title: "Viewport", status: "todo", folderName: "v-1-viewport" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    await ctx.page.mouse.move(600, 400);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await ctx.page.mouse.move(600 + i * 20, 400 + i * 10);
      await ctx.page.waitForTimeout(30);
    }
    await ctx.page.mouse.up();
    await ctx.page.waitForTimeout(500);

    await ctx.page.reload();
    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });

    const vpStr = await getLocalStorageItem(ctx.page, `forest-viewport:${projectSlug}`);
    expect(vpStr).toBeTruthy();
    const vp = JSON.parse(vpStr!);
    expect(typeof vp.x).toBe("number");
    expect(typeof vp.y).toBe("number");
    expect(typeof vp.scale).toBe("number");
  }, 120000);

  it("keeps a panned Forest in place when switching to kanban and back", async () => {
    const projectSlug = uniqueSlug("fv-toggle-vp");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "P-1", title: "Panned", status: "todo", folderName: "p-1-panned" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    const card = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="P-1"]',
    );
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).toBeTruthy();

    const start = {
      x: surfaceBox!.x + surfaceBox!.width - 40,
      y: surfaceBox!.y + surfaceBox!.height - 40,
    };
    await ctx.page.mouse.move(start.x, start.y);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(start.x - 180, start.y - 110);
    await ctx.page.mouse.up();
    await ctx.page.waitForTimeout(500);

    const beforeToggle = await card.boundingBox();
    expect(beforeToggle).toBeTruthy();

    await ctx.page.click('[data-testid="project-header-forest-toggle-button"]');
    await ctx.page.waitForSelector('[data-testid="kanban-board-column-header"]', {
      state: "visible", timeout: 15000,
    });
    await toggleToForest(ctx.page);

    const afterToggle = await card.boundingBox();
    expect(afterToggle).toBeTruthy();
    expect(afterToggle!.x).toBeCloseTo(beforeToggle!.x, 0);
    expect(afterToggle!.y).toBeCloseTo(beforeToggle!.y, 0);
  }, 120000);

  it("shows the default cursor at idle and grabbing while panning", async () => {
    const projectSlug = uniqueSlug("fv-pan-cursor");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "P-1", title: "Pan", status: "todo", folderName: "p-1-pan" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    const pane = surface.locator(".solid-flow__pane");
    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).toBeTruthy();
    const start = {
      x: surfaceBox!.x + surfaceBox!.width - 30,
      y: surfaceBox!.y + surfaceBox!.height - 30,
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
    const projectSlug = uniqueSlug("fv-sel");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Select1", status: "todo", folderName: "s-1-select1" },
        { number: "S-2", title: "Select2", status: "todo", folderName: "s-2-select2" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const surfaceBox = await ctx.page.locator('[data-testid="forest-surface"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const sx = surfaceBox.x + surfaceBox.w / 2;
    const sy = surfaceBox.y + surfaceBox.h / 2;

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
    const projectSlug = uniqueSlug("fv-htop");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "H-1", title: "HandleTop", status: "todo", folderName: "h-1-handletop" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const card = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="H-1"]');
    await card.waitFor({ state: "visible", timeout: 15000 });
    const box = await card.boundingBox();
    expect(box).toBeTruthy();

    await ctx.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
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
    const projectSlug = uniqueSlug("fv-cancel-connection");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Alpha", status: "todo", folderName: "a-1-alpha" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const card = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="A-1"]',
    );
    await card.hover();
    await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="A-1"]',
    ).click();

    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    expect(await surface.getAttribute("data-connection-edit-mode")).toBe("active");
    const cardGutter = await card.locator("..").boundingBox();
    expect(cardGutter).toBeTruthy();
    await ctx.page.mouse.click(cardGutter!.x + 12, cardGutter!.y + 2);

    expect(await surface.getAttribute("data-connection-edit-mode")).toBeNull();
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);
  }, 120000);

  it("Escape exits connection mode", async () => {
    const projectSlug = uniqueSlug("fv-escape-connection");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Alpha", status: "todo", folderName: "a-1-alpha" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const card = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="A-1"]',
    );
    await card.hover();
    await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="A-1"]',
    ).click();
    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    expect(await surface.getAttribute("data-connection-edit-mode")).toBe("active");

    await ctx.page.keyboard.press("Escape");

    expect(await surface.getAttribute("data-connection-edit-mode")).toBeNull();
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);
  }, 120000);

  it("exits connection mode after connecting or clicking empty space", async () => {
    const projectSlug = uniqueSlug("fv-connection-mode");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "Alpha", status: "todo", folderName: "a-1-alpha" },
        { number: "B-1", title: "Beta", status: "todo", folderName: "b-1-beta" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, projectSlug);
    await toggleToForest(ctx.page);

    const sourceCard = ctx.page.locator('[data-testid="forest-ticket-card"][data-ticket-number="A-1"]');
    await sourceCard.hover();
    const sourceHandle = ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="A-1"]',
    );
    await sourceHandle.click();

    const targetHandle = ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="B-1"]',
    );
    expect(await sourceHandle.getAttribute("data-connection-handle-state")).toBe("source");
    expect(await targetHandle.getAttribute("data-connection-handle-state")).toBe("available");
    expect(await ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="A-1"]',
    ).getAttribute("data-connection-handle-state")).toBe("hidden");
    expect(await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="B-1"]',
    ).getAttribute("data-connection-handle-state")).toBe("hidden");
    const preview = ctx.page.locator('[data-testid="forest-connection-preview"]');
    expect(await preview.count()).toBe(1);
    const initialPreviewPath = await preview.getAttribute("d");
    const sourceBox = await sourceCard.boundingBox();
    expect(sourceBox).toBeTruthy();
    await ctx.page.mouse.move(sourceBox!.x + sourceBox!.width + 40, sourceBox!.y + sourceBox!.height / 2);
    await expect.poll(() => preview.getAttribute("d")).not.toBe(initialPreviewPath);

    await targetHandle.click();
    await expect.poll(
      () => readTicketStatus(ctx.testServer, projectSlug, "a-1-alpha")?.dependsOn,
      { timeout: 10000 },
    ).toContain("B-1");

    const surface = ctx.page.locator('[data-testid="forest-surface"]');
    await expect.poll(
      () => surface.getAttribute("data-connection-edit-mode"),
      { timeout: 10000 },
    ).toBeNull();
    expect(await sourceHandle.getAttribute("data-connection-handle-state")).toBe("hidden");
    expect(await ctx.page.locator('[data-testid="forest-connection-preview"]').count()).toBe(0);

    await sourceCard.hover();
    await sourceHandle.click();
    expect(await surface.getAttribute("data-connection-edit-mode")).toBe("active");

    const surfaceBox = await surface.boundingBox();
    expect(surfaceBox).toBeTruthy();
    await ctx.page.mouse.click(surfaceBox!.x + surfaceBox!.width - 24, surfaceBox!.y + surfaceBox!.height - 24);

    expect(await sourceHandle.getAttribute("data-connection-handle-state")).toBe("hidden");
  }, 120000);
}, 120000);
