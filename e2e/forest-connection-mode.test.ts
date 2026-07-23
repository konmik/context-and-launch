import { describe, it, expect } from "vitest";
import { setupE2E, readTicketStatus } from "./fixtures.js";
import {
  boxOf, centerOf, clickHandle, deleteDependencyViaPopup, dragPointer,
  forestCard, forestHandle, forestSurface, openForestProject,
  pathScreenEndpoints, pathScreenPoint,
} from "./forest-helpers.js";

describe("Forest connection mode", () => {
  const ctx = setupE2E();

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
