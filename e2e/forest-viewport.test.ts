import { describe, it, expect } from "vitest";
import { setupE2E, getLocalStorageItem } from "./fixtures.js";
import {
  boxOf, dragPointer, forestCard, forestSurface, openForestProject,
  toggleToForest, toggleToKanban,
} from "./forest-helpers.js";

describe("Forest viewport", () => {
  const ctx = setupE2E();

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
    expect(centerBox.x - rearrangeBox.x - rearrangeBox.width).toBeCloseTo(8, 0);
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
}, 120000);
