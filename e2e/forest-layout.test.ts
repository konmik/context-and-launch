import { describe, it, expect } from "vitest";
import {
  setupE2E, readTicketStatus, readForestLayout, getLocalStorageItem, poll,
} from "./fixtures.js";
import {
  boxOf, centerOf, clickHandle, dragPointer, forestCard, forestHandle,
  openForestProject, toggleToKanban, waitForForestTicketCount,
} from "./forest-helpers.js";

describe("Forest layout and persistence", () => {
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

  it("toggle + persistence", async () => {
    const project = await openForestProject(ctx, {
      slugBase: "fv-toggle",
      tickets: [
        { number: "A-1", title: "First", folderName: "a-1-first" },
      ],
    });

    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(1);

    const viewMode = await getLocalStorageItem(ctx.page, `view-mode:${project.projectSlug}`);
    expect(viewMode).toBe("forest");

    await ctx.page.reload();
    await ctx.page.waitForSelector('[data-testid="forest-rearrange-button"]', { state: "visible", timeout: 15000 });
    await waitForForestTicketCount(ctx.page, 1);
    expect(await ctx.page.locator('[data-testid="forest-ticket-card"]').count()).toBe(1);

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
