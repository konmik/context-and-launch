import { describe, it, expect } from "vitest";
import {
  readProjectLauncherConfig, poll,
  setupE2E,
} from "./fixtures.js";
import { setupLauncherTicket } from "./ticket-detail-launcher-shared.js";

describe("Ticket detail launcher config and run (e2e, real server)", () => {
  const ctx = setupE2E();
  it("profile select persists selection to project launcher config", async () => {
    const project = await setupLauncherTicket(ctx, "profile");
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-profile-select"]', "GPT");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.profileName === "GPT",
      5000,
    );
    expect(cfg?.columnDefaults?.["todo"]?.profileName).toBe("GPT");
  }, 60000);

  it("template select persists selection to project launcher config", async () => {
    const project = await setupLauncherTicket(ctx, "template");
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-template-select"]', "Other");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.templateName === "Other",
      5000,
    );
    expect(cfg?.columnDefaults?.["todo"]?.templateName).toBe("Other");
  }, 60000);

  it("skill checkbox toggle persists to project launcher config", async () => {
    const project = await setupLauncherTicket(ctx, "skill-toggle");
    const cb = ctx.page.locator(
      '[data-testid="ticket-detail-launcher-skill-checkbox"][data-skill-name="alpha-skill"]',
    );
    await cb.waitFor({ state: "visible", timeout: 15000 });
    await cb.check();
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.["todo"]?.checkedSkills?.includes("alpha-skill") ?? false,
      5000,
    );
    expect(cfg?.columnDefaults?.["todo"]?.checkedSkills).toContain("alpha-skill");
  }, 60000);

  it("run button is clickable and triggers an HTTP request", async () => {
    await setupLauncherTicket(ctx, "run");
    let aiRunRequest = false;
    ctx.page.on("request", (req) => {
      if (req.url().includes("/_server")) aiRunRequest = true;
    });
    await ctx.page.click('[data-testid="ticket-detail-launcher-run-button"]');
    await ctx.page.waitForTimeout(2000);
    expect(aiRunRequest).toBe(true);
  }, 60000);

  it("reference-only: behind-remote and dirty-worktree dialog testids are absent on happy path", async () => {
    await setupLauncherTicket(ctx, "ref-only");
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-behind-remote-cancel"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-behind-remote-proceed"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-dirty-cancel"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-dirty-launch-anyway"]').count()).toBe(0);
  }, 60000);

  it("launch dir display shows project path when worktree is off", async () => {
    const project = await setupLauncherTicket(ctx, "dir-off");
    const display = ctx.page.locator('[data-testid="launch-dir-display"]');
    await display.waitFor({ state: "visible", timeout: 15000 });
    const text = await display.textContent();
    expect(text).toContain(project.projectPath);
    expect(await ctx.page.locator('[data-testid="launch-dir-copy-button"]').count()).toBe(1);
  }, 60000);

  it("launch dir display updates when worktree toggle changes", async () => {
    const project = await setupLauncherTicket(ctx, "dir-toggle");
    const display = ctx.page.locator('[data-testid="launch-dir-display"]');
    await display.waitFor({ state: "visible", timeout: 15000 });
    const textBefore = await display.textContent();
    expect(textBefore).toContain(project.projectPath);
    const cb = ctx.page.locator('[data-testid="ticket-detail-use-worktree-checkbox"]');
    await cb.check();
    await ctx.page.waitForTimeout(500);
    const textAfter = await display.textContent();
    expect(textAfter).toContain("t-1-alpha");
    expect(textAfter).not.toContain(project.projectPath);
    await cb.uncheck();
    await ctx.page.waitForTimeout(500);
    const textReverted = await display.textContent();
    expect(textReverted).toContain(project.projectPath);
  }, 60000);
});
