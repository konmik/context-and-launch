import { describe, it, expect } from "vitest";
import { setupE2E, readTicketStatus } from "./fixtures.js";
import {
  boxOf, centerOf, clickHandle, closeSubforest, deleteDependencyViaPopup,
  forestCard, forestHandle, forestSurface, openForestProject, openSubforest,
  pathScreenEndpoints, pathScreenPoint, subforestCloseButton,
} from "./forest-helpers.js";

describe("Forest group connections", () => {
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
}, 120000);
