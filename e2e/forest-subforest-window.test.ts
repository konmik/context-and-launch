import { describe, it, expect } from "vitest";
import { setupE2E } from "./fixtures.js";
import {
  boxOf, closeSubforest, forestCard, forestGroupCard, openForestProject,
  openSubforest, pathScreenEndpoints, subforestCloseButton,
} from "./forest-helpers.js";

describe("Forest sub-forest window", () => {
  const ctx = setupE2E();

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
}, 120000);
