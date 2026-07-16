import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  setupE2E, createProject, gotoProject, uniqueSlug,
  readTicketStatus, readForestLayout, listTicketFolders,
  clickTicketMenuItem,
} from "./fixtures.js";

const boards = [{ id: "default", name: "Default", columns: [{ name: "todo" }, { name: "done" }] }];

describe("Forest Grouping", () => {
  const ctx = setupE2E();

  async function toggleToForest() {
    await ctx.page.click('[data-testid="project-header-forest-toggle-button"]');
    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });
  }

  async function toggleToKanban() {
    await ctx.page.click('[data-testid="project-header-forest-toggle-button"]');
    await ctx.page.waitForSelector('[data-testid="kanban-board-column-header"]', { state: "visible", timeout: 15000 });
  }

  async function shiftDragSelection(x1: number, y1: number, x2: number, y2: number) {
    await ctx.page.keyboard.down("Shift");
    await ctx.page.mouse.move(x1, y1);
    await ctx.page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await ctx.page.mouse.move(
        x1 + (x2 - x1) * (i / 10),
        y1 + (y2 - y1) * (i / 10),
      );
      await ctx.page.waitForTimeout(20);
    }
    await ctx.page.mouse.up();
    await ctx.page.keyboard.up("Shift");
    await ctx.page.waitForTimeout(300);
  }

  async function groupViaDialog(number: string, title: string) {
    await ctx.page.click('[data-testid="forest-group-button"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.fill('[data-testid="create-ticket-number-input"]', number);
    await ctx.page.fill('[data-testid="create-ticket-title-input"]', title);
    await ctx.page.click('[data-testid="create-ticket-submit"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForTimeout(1000);
  }

  it("rectangle selection + grouping creates group and hides members", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-select"),
      withBoards: boards,
      withTickets: [
        { number: "A-1", title: "First", status: "todo" },
        { number: "A-2", title: "Second", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    await ctx.page.waitForSelector('[data-testid="forest-ticket-card"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(2);

    const surfaceBox = await ctx.page.locator('[data-testid="forest-surface"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await shiftDragSelection(
      surfaceBox.x + 10, surfaceBox.y + 10,
      surfaceBox.x + surfaceBox.w - 10, surfaceBox.y + surfaceBox.h - 10,
    );

    const groupBtn = ctx.page.locator('[data-testid="forest-group-button"]');
    await groupBtn.waitFor({ state: "visible", timeout: 10000 });
    await groupViaDialog("G-1", "My Group");

    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    const groupFolder = folders.find((f) => f.startsWith("g-1-"));
    expect(groupFolder).toBeDefined();

    const s1 = readTicketStatus(ctx.testServer, project.projectSlug, "a-1-first");
    const s2 = readTicketStatus(ctx.testServer, project.projectSlug, "a-2-second");
    expect(s1?.memberOf).toBe("G-1");
    expect(s2?.memberOf).toBe("G-1");

    await ctx.page.waitForTimeout(500);
    const groupCards = await ctx.page.locator('[data-testid="forest-group-card"]').count();
    expect(groupCards).toBeGreaterThanOrEqual(1);
  }, 120000);

  it("sub-forest opens and closes", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-sub"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member One", status: "todo", memberOf: "S-G" },
        { number: "S-2", title: "Member Two", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const groupCard = ctx.page.locator('[data-testid="forest-group-card"]');
    await groupCard.waitFor({ state: "visible", timeout: 15000 });
    await groupCard.click();
    await ctx.page.waitForTimeout(500);

    const closeBtn = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeBtn.waitFor({ state: "visible", timeout: 10000 });
    await closeBtn.click();
    await ctx.page.waitForTimeout(300);
    expect(await ctx.page.locator('[data-testid="forest-subforest-close"]').count()).toBe(0);
  }, 120000);

  it("centers only the tickets inside the open Group", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-center-scope"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "First member", status: "todo", memberOf: "S-G" },
        { number: "S-2", title: "Second member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Target Group", status: "todo" },
        { number: "O-1", title: "Distant member", status: "todo", memberOf: "O-G" },
        { number: "O-G", title: "Other Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    fs.writeFileSync(
      path.join(project.ticketsPath, "forest-layout.json"),
      JSON.stringify({
        "S-1": { x: 0, y: 0 },
        "S-2": { x: 300, y: 0 },
        "S-G": { x: 2500, y: 0 },
        "O-G": { x: 2800, y: 0 },
        "O-1": { x: 5000, y: 0 },
      }),
    );
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    await ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    ).click();
    const subforest = ctx.page.locator('[data-testid="forest-subforest-backdrop"]');
    const surface = subforest.locator('[data-testid="forest-surface"]');
    await subforest.locator('[data-testid="forest-subforest-close"]').waitFor({
      state: "visible", timeout: 10000,
    });

    await ctx.page.waitForTimeout(300);
    await surface.locator('[data-testid="forest-center-button"]').click();

    const surfaceBox = await surface.boundingBox();
    const cardBoxes = await subforest.locator('[data-testid="forest-ticket-card"]')
      .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    expect(surfaceBox).toBeTruthy();
    expect(cardBoxes).toHaveLength(2);
    const left = Math.min(...cardBoxes.map(box => box.x));
    const right = Math.max(...cardBoxes.map(box => box.x + box.width));
    expect((left + right) / 2).toBeCloseTo(surfaceBox!.x + surfaceBox!.width / 2, 0);
  }, 120000);

  it("keeps internal and external connectors attached after a Group finishes opening", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-open-connector-alignment"),
      withBoards: boards,
      withTickets: [
        {
          number: "S-1",
          title: "A dependent title long enough to wrap onto another line",
          status: "todo",
          memberOf: "S-G",
          dependsOn: ["S-2"],
        },
        {
          number: "S-2",
          title: "A dependency title long enough to wrap onto another line",
          status: "todo",
          memberOf: "S-G",
        },
        {
          number: "S-G",
          title: "Group",
          status: "todo",
        },
        {
          number: "S-OUT",
          title: "Outside",
          status: "todo",
          dependsOn: ["S-1"],
        },
      ],
    });
    ctx.projects.push(project);
    fs.writeFileSync(
      path.join(project.ticketsPath, "forest-layout.json"),
      JSON.stringify({
        "S-1": { x: -166.6666259765625, y: -245.33331298828125 },
        "S-2": { x: 221.3333740234375, y: -64 },
      }),
    );
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    await ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    ).click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({ state: "visible", timeout: 10000 });
    await ctx.page.waitForTimeout(500);

    const dependentCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="S-1"]',
    );
    const dependencyCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="S-2"]',
    );
    const dependentBox = await dependentCard.boundingBox();
    const dependencyBox = await dependencyCard.boundingBox();
    expect(dependentBox).toBeTruthy();
    expect(dependencyBox).toBeTruthy();
    expect(dependentBox!.height).toBeGreaterThan(72);
    expect(dependencyBox!.height).toBeGreaterThan(72);

    const subforest = ctx.page.locator('[data-testid="forest-subforest-backdrop"]');
    const readEndpoints = (selector: string) => ctx.page.locator(selector).evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Dependency line is not rendered on screen");
      const screenPoint = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return {
        start: screenPoint(svgPath.getPointAtLength(0)),
        end: screenPoint(svgPath.getPointAtLength(svgPath.getTotalLength())),
      };
    });

    const internalEndpoints = await readEndpoints(
      '[data-testid="forest-subforest-backdrop"] [data-testid="forest-dependency"]',
    );
    expect(internalEndpoints.start.x).toBeCloseTo(dependentBox!.x + dependentBox!.width / 2, 1);
    expect(internalEndpoints.start.y).toBeCloseTo(dependentBox!.y + dependentBox!.height, 1);
    expect(internalEndpoints.end.x).toBeCloseTo(dependencyBox!.x + dependencyBox!.width / 2, 1);
    expect(internalEndpoints.end.y).toBeCloseTo(dependencyBox!.y, 1);

    const externalEndpoints = await readEndpoints(
      '[data-testid="forest-subforest-backdrop"] [data-testid="forest-external-dependency"]',
    );
    expect(externalEndpoints.start.x).toBeCloseTo(dependentBox!.x + dependentBox!.width / 2, 1);
    expect(externalEndpoints.start.y).toBeCloseTo(dependentBox!.y, 1);
  }, 120000);

  it("clicking outside an open Group closes it", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-outside-close"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    await ctx.page.locator('[data-testid="forest-group-card"]').click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({ state: "visible", timeout: 10000 });
    const backdropBox = await ctx.page.locator(
      '[data-testid="forest-subforest-backdrop"]',
    ).boundingBox();
    expect(backdropBox).toBeTruthy();

    await ctx.page.mouse.click(backdropBox!.x + 10, backdropBox!.y + 10);

    await closeButton.waitFor({ state: "detached", timeout: 10000 });
  }, 120000);

  it("opening and closing a Group preserves connection mode", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-close-connection"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const groupCard = ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    );
    await groupCard.hover();
    await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="S-G"]',
    ).click();
    const rootSurface = ctx.page.locator('[data-testid="forest-surface"]').first();
    expect(await rootSurface.getAttribute("data-connection-edit-mode")).toBe("active");

    await groupCard.click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({ state: "visible", timeout: 10000 });
    expect(await rootSurface.getAttribute("data-connection-edit-mode")).toBe("active");
    await closeButton.click();
    await closeButton.waitFor({ state: "detached", timeout: 10000 });

    expect(await rootSurface.getAttribute("data-connection-edit-mode")).toBe("active");
    const preview = ctx.page.locator('[data-testid="forest-connection-preview"]');
    expect(await preview.count()).toBe(1);
    const surfaceBox = await rootSurface.boundingBox();
    expect(surfaceBox).toBeTruthy();
    const pointer = {
      x: surfaceBox!.x + surfaceBox!.width * 0.25,
      y: surfaceBox!.y + surfaceBox!.height * 0.25,
    };
    await ctx.page.mouse.move(pointer.x, pointer.y);
    const endpoint = await preview.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const point = svgPath.getPointAtLength(svgPath.getTotalLength());
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Connection preview is not rendered on screen");
      return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      };
    });
    expect(Math.hypot(endpoint.x - pointer.x, endpoint.y - pointer.y)).toBeLessThan(4);
  }, 120000);

  it("reattaches an active member connector after closing its Group", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-close-member-connection"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const groupCard = ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    );
    await groupCard.click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({ state: "visible", timeout: 10000 });
    const memberCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="S-1"]',
    );
    await memberCard.hover();
    const memberHandle = ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="S-1"]',
    );
    const memberHandleBox = await memberHandle.boundingBox();
    expect(memberHandleBox).toBeTruthy();
    await ctx.page.mouse.click(
      memberHandleBox!.x + memberHandleBox!.width / 2,
      memberHandleBox!.y + memberHandleBox!.height / 2,
    );

    await closeButton.click();
    await closeButton.waitFor({ state: "detached", timeout: 10000 });
    const rootSurface = ctx.page.locator('[data-testid="forest-surface"]').first();
    const surfaceBox = await rootSurface.boundingBox();
    expect(surfaceBox).toBeTruthy();
    const pointer = {
      x: surfaceBox!.x + surfaceBox!.width * 0.25,
      y: surfaceBox!.y + surfaceBox!.height * 0.25,
    };
    await ctx.page.mouse.move(pointer.x, pointer.y);

    const preview = ctx.page.locator('[data-testid="forest-connection-preview"]');
    const endpoints = await preview.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Connection preview is not rendered on screen");
      const screenPoint = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return {
        start: screenPoint(svgPath.getPointAtLength(0)),
        end: screenPoint(svgPath.getPointAtLength(svgPath.getTotalLength())),
      };
    });
    const groupHandle = await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="S-G"]',
    );
    expect(await groupHandle.getAttribute("data-connection-handle-state")).toBe("source");
    const groupHandleBox = await groupHandle.boundingBox();
    expect(groupHandleBox).toBeTruthy();
    const expectedStart = {
      x: groupHandleBox!.x + groupHandleBox!.width / 2,
      y: groupHandleBox!.y + groupHandleBox!.height / 2,
    };

    expect(Math.hypot(endpoints.end.x - pointer.x, endpoints.end.y - pointer.y)).toBeLessThan(4);
    expect(Math.hypot(
      endpoints.start.x - expectedStart.x,
      endpoints.start.y - expectedStart.y,
    )).toBeLessThan(4);
  }, 120000);

  it("connects a root ticket to a ticket inside an open sub-forest", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-connect-member"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
        { number: "S-OUT", title: "Outside", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const groupCard = ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    );
    const sourceCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="S-OUT"]',
    );
    await sourceCard.hover();
    await ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="S-OUT"]',
    ).click();

    await groupCard.click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({
      state: "visible", timeout: 10000,
    });
    await ctx.page.waitForTimeout(300);
    const groupWindowBox = await closeButton.locator("..").boundingBox();
    expect(groupWindowBox).toBeTruthy();

    const memberHandle = ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="S-1"]',
    );
    const memberHandleBox = await memberHandle.boundingBox();
    expect(memberHandleBox).toBeTruthy();
    const memberHandleCenter = {
      x: memberHandleBox!.x + memberHandleBox!.width / 2,
      y: memberHandleBox!.y + memberHandleBox!.height / 2,
    };
    await ctx.page.mouse.move(memberHandleCenter.x, memberHandleCenter.y);
    const previewPoints = await ctx.page.locator('[data-testid="forest-connection-preview"]').evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Connection preview is not rendered on screen");
      const screenPoint = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return {
        start: screenPoint(svgPath.getPointAtLength(0)),
        end: screenPoint(svgPath.getPointAtLength(svgPath.getTotalLength())),
      };
    });
    expect(Math.abs(previewPoints.start.y - groupWindowBox!.y)).toBeLessThan(4);
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
    const externalEndpoints = await externalDependency.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("External dependency is not rendered on screen");
      const screenPoint = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return [
        screenPoint(svgPath.getPointAtLength(0)),
        screenPoint(svgPath.getPointAtLength(svgPath.getTotalLength())),
      ];
    });
    expect(Math.abs(Math.min(...externalEndpoints.map(point => point.y)) - groupWindowBox!.y)).toBeLessThan(4);
  }, 120000);

  it("lands downward cross-surface connections at the bottom of the Group window", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-connect-member-down"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
        { number: "S-OUT", title: "Outside", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const sourceCard = ctx.page.locator(
      '[data-testid="forest-ticket-card"][data-ticket-number="S-OUT"]',
    );
    await sourceCard.hover();
    await ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="S-OUT"]',
    ).click();

    await ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    ).click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({ state: "visible", timeout: 10000 });
    await ctx.page.waitForTimeout(300);
    const groupWindowBox = await closeButton.locator("..").boundingBox();
    expect(groupWindowBox).toBeTruthy();

    const memberHandle = ctx.page.locator(
      '[data-testid="forest-handle-bottom"][data-ticket-number="S-1"]',
    );
    const memberHandleBox = await memberHandle.boundingBox();
    expect(memberHandleBox).toBeTruthy();
    const memberHandleCenter = {
      x: memberHandleBox!.x + memberHandleBox!.width / 2,
      y: memberHandleBox!.y + memberHandleBox!.height / 2,
    };
    await ctx.page.mouse.move(memberHandleCenter.x, memberHandleCenter.y);
    const previewPoints = await ctx.page.locator('[data-testid="forest-connection-preview"]').evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Connection preview is not rendered on screen");
      const screenPoint = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return {
        start: screenPoint(svgPath.getPointAtLength(0)),
        end: screenPoint(svgPath.getPointAtLength(svgPath.getTotalLength())),
      };
    });
    const groupWindowBottom = groupWindowBox!.y + groupWindowBox!.height;
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
    const externalEndpoints = await externalDependency.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("External dependency is not rendered on screen");
      const screenPoint = (point: DOMPoint) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      });
      return [
        screenPoint(svgPath.getPointAtLength(0)),
        screenPoint(svgPath.getPointAtLength(svgPath.getTotalLength())),
      ];
    });
    expect(Math.abs(Math.max(...externalEndpoints.map(point => point.y)) - groupWindowBottom)).toBeLessThan(4);
  }, 120000);

  it("selects and deletes an inward dependency from inside a Group", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-delete-external-down"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "Member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
        { number: "S-OUT", title: "Outside", status: "todo", dependsOn: ["S-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    await ctx.page.locator(
      '[data-testid="forest-group-card"][data-ticket-number="S-G"]',
    ).click();
    const closeButton = ctx.page.locator('[data-testid="forest-subforest-close"]');
    await closeButton.waitFor({
      state: "visible", timeout: 10000,
    });

    const externalDependency = ctx.page.locator('[data-testid="forest-external-dependency"]');
    await externalDependency.waitFor({ state: "attached", timeout: 10000 });
    const groupWindowBox = await closeButton.locator("..").boundingBox();
    const memberHandleBox = await ctx.page.locator(
      '[data-testid="forest-handle-top"][data-ticket-number="S-1"]',
    ).boundingBox();
    expect(groupWindowBox).toBeTruthy();
    expect(memberHandleBox).toBeTruthy();
    const clickPoint = {
      x: memberHandleBox!.x + memberHandleBox!.width / 2,
      y: (groupWindowBox!.y + memberHandleBox!.y) / 2,
    };
    await ctx.page.mouse.click(clickPoint.x, clickPoint.y);

    const deleteButton = ctx.page.locator('[data-testid="forest-dependency-delete"]');
    await deleteButton.waitFor({ state: "visible", timeout: 10000 });
    await deleteButton.click();

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
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-delete-projected"),
      withBoards: boards,
      withTickets: [
        { number: "S-1", title: "First member", status: "todo", memberOf: "S-G" },
        { number: "S-2", title: "Second member", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
        {
          number: "S-OUT",
          title: "Outside",
          status: "todo",
          dependsOn: ["S-1", "S-2"],
        },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const dependency = ctx.page.locator('[data-testid="forest-dependency"]');
    await dependency.waitFor({ state: "attached", timeout: 10000 });
    await ctx.page.waitForTimeout(300);
    const clickPoint = await dependency.evaluate((path) => {
      const svgPath = path as SVGPathElement;
      const point = svgPath.getPointAtLength(svgPath.getTotalLength() / 2);
      const matrix = svgPath.getScreenCTM();
      if (!matrix) throw new Error("Projected dependency is not rendered on screen");
      return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      };
    });
    await ctx.page.mouse.click(clickPoint.x, clickPoint.y);

    const deleteButton = ctx.page.locator('[data-testid="forest-dependency-delete"]');
    await deleteButton.waitFor({ state: "visible", timeout: 10000 });
    await deleteButton.click();

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
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-nested"),
      withBoards: boards,
      withTickets: [
        { number: "N-1", title: "Inner A", status: "todo", memberOf: "N-G" },
        { number: "N-2", title: "Inner B", status: "todo", memberOf: "N-G" },
        { number: "N-G", title: "Outer Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const groupCard = ctx.page.locator('[data-testid="forest-group-card"]');
    await groupCard.waitFor({ state: "visible", timeout: 15000 });
    await groupCard.click();
    await ctx.page.waitForSelector('[data-testid="forest-subforest-close"]', {
      state: "visible", timeout: 10000,
    });

    const subRearrange = ctx.page.locator('[data-testid="forest-rearrange-button"]').nth(1);
    await subRearrange.waitFor({ state: "visible", timeout: 10000 });
    await subRearrange.click();
    await ctx.page.waitForTimeout(500);

    const subSurfaceBox = await ctx.page.locator('[data-testid="forest-surface"]').nth(1).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await shiftDragSelection(
      subSurfaceBox.x + 10, subSurfaceBox.y + 80,
      subSurfaceBox.x + subSurfaceBox.w - 10, subSurfaceBox.y + subSurfaceBox.h - 10,
    );

    const groupBtn = ctx.page.locator('[data-testid="forest-group-button"]');
    await groupBtn.waitFor({ state: "visible", timeout: 10000 });
    await groupViaDialog("NG-1", "Nested Group");

    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    const nestedFolder = folders.find((f) => f.startsWith("ng-1-"));
    expect(nestedFolder).toBeDefined();

    const nestedStatus = readTicketStatus(ctx.testServer, project.projectSlug, nestedFolder!);
    expect(nestedStatus?.memberOf).toBe("N-G");
    await expect.poll(
      () => ctx.page.locator('[data-testid="forest-surface"]').evaluateAll(surfaces =>
        surfaces.map(surface =>
          surface.querySelectorAll('[data-testid="forest-group-button"]').length)),
      { timeout: 10000 },
    ).toEqual([0, 0]);
  }, 120000);

  it("ungroup removes memberOf and keeps group ticket", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-ungroup"),
      withBoards: boards,
      withTickets: [
        { number: "U-1", title: "Mem A", status: "todo", memberOf: "U-G" },
        { number: "U-2", title: "Mem B", status: "todo", memberOf: "U-G" },
        { number: "U-G", title: "Grp", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    const groupCard = ctx.page.locator('[data-testid="forest-group-card"]');
    await groupCard.waitFor({ state: "visible", timeout: 15000 });

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
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-open"),
      withBoards: boards,
      withTickets: [
        { number: "O-1", title: "Child", status: "todo", memberOf: "O-G" },
        { number: "O-G", title: "Parent Group", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await toggleToForest();

    await ctx.page.waitForSelector('[data-testid="forest-group-card"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="forest-group-menu-trigger"]');
    await ctx.page.waitForTimeout(300);
    await ctx.page.click('[data-testid="forest-group-menu-open-ticket"]');

    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "visible", timeout: 15000,
    });
  }, 120000);

  it("kanban renders group and members as ordinary cards", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-kanban"),
      withBoards: boards,
      withTickets: [
        { number: "K-1", title: "Mem X", status: "todo", memberOf: "K-G" },
        { number: "K-2", title: "Mem Y", status: "todo", memberOf: "K-G" },
        { number: "K-G", title: "Grp Z", status: "todo" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    const kanbanCards = await ctx.page.locator('[data-testid="kanban-board-ticket-card"]').count();
    expect(kanbanCards).toBe(3);
  }, 120000);

  it("number edit cascade rewrites dependsOn and renames layout key", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-cascade"),
      withBoards: boards,
      withTickets: [
        { number: "C-1", title: "Depended", status: "todo" },
        { number: "C-2", title: "Dependent", status: "todo", dependsOn: ["C-1"] },
      ],
    });
    ctx.projects.push(project);

    fs.writeFileSync(
      path.join(project.ticketsPath, "forest-layout.json"),
      JSON.stringify({ "C-1": { x: 0, y: 0 }, "C-2": { x: 200, y: -160 } }),
    );

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    const c1Card = ctx.page.locator('[data-testid="kanban-board-ticket-card"]', {
      has: ctx.page.locator('text=C-1'),
    });
    await c1Card.hover();
    await ctx.page.waitForTimeout(200);
    const c1Menu = c1Card.locator('[data-testid="kanban-board-ticket-menu-trigger"]');
    await c1Menu.click();
    const editItem = ctx.page.locator('[data-testid="kanban-board-ticket-menu-edit"]').first();
    await editItem.waitFor({ state: "attached", timeout: 10000 });
    await ctx.page.evaluate(() => {
      const el = document.querySelector('[data-testid="kanban-board-ticket-menu-edit"]') as HTMLElement | null;
      if (el) el.click();
    });
    await ctx.page.waitForSelector('[data-testid="edit-ticket-number-input"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.fill('[data-testid="edit-ticket-number-input"]', "NEW-1");
    await ctx.page.click('[data-testid="edit-ticket-submit"]');
    await ctx.page.waitForTimeout(2000);

    const depStatus = readTicketStatus(ctx.testServer, project.projectSlug, "c-2-dependent");
    expect(depStatus?.dependsOn).toContain("NEW-1");
    expect(depStatus?.dependsOn).not.toContain("C-1");

    const layout = readForestLayout(ctx.testServer, project.projectSlug);
    expect(layout).not.toBeNull();
    expect(layout!["NEW-1"]).toBeDefined();
    expect(layout!["C-1"]).toBeUndefined();
  }, 120000);

  it("archive leaves dependsOn and memberOf untouched, hides from forest", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("fg-archive"),
      withBoards: boards,
      withTickets: [
        { number: "AR-1", title: "Base", status: "todo" },
        { number: "AR-2", title: "Archivable", status: "todo", dependsOn: ["AR-1"] },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    const cards = ctx.page.locator('[data-testid="kanban-board-ticket-card"]');
    await cards.first().waitFor({ state: "visible", timeout: 15000 });

    const ar2Card = ctx.page.locator('[data-testid="kanban-board-ticket-card"]', {
      has: ctx.page.locator(`text=AR-2`),
    });
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
    await ctx.page.waitForSelector('[data-testid="archive-ticket-submit"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="archive-ticket-submit"]');
    await ctx.page.waitForTimeout(3000);

    const archivedDir = path.join(project.ticketsPath, "archive", "ar-2-archivable");
    expect(fs.existsSync(archivedDir)).toBe(true);
    const archivedStatus = JSON.parse(
      fs.readFileSync(path.join(archivedDir, "status.json"), "utf-8"),
    );
    expect(archivedStatus.dependsOn).toContain("AR-1");

    const baseStatus = readTicketStatus(ctx.testServer, project.projectSlug, "ar-1-base");
    expect(baseStatus?.number).toBe("AR-1");

    await toggleToForest();
    await ctx.page.waitForTimeout(500);

    const forestCards = await ctx.page.locator('[data-testid="forest-ticket-card"]').count();
    expect(forestCards).toBe(1);

    expect(await ctx.page.locator('[data-testid="forest-external-dependency"]').count()).toBe(0);
  }, 120000);
}, 120000);
