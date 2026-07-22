import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  readProjectLauncherConfig, poll,
  setupE2E,
} from "./fixtures.js";
import { APP_LAUNCHER, openLauncher, setupLauncherTicket } from "./ticket-detail-launcher-shared.js";

describe("Ticket detail Launcher tab (e2e, real server)", () => {
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

  it("prompt preview shows interpolated template text", async () => {
    const project = await setupLauncherTicket(ctx, "preview-text");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const text = await cm.textContent();
    expect(text).toContain("do it in");
    expect(text).not.toContain("{{ticketDir}}");
    expect(text).toContain(project.projectSlug);
  }, 60000);

  it("prompt preview updates when template selection changes", async () => {
    await setupLauncherTicket(ctx, "preview-change");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const textBefore = await cm.textContent();
    expect(textBefore).toContain("do it in");
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-template-select"]', "Other");
    await ctx.page.waitForTimeout(500);
    const textAfter = await cm.textContent();
    expect(textAfter).toContain("other");
  }, 60000);

  it("prompt preview includes checked skill text", async () => {
    await setupLauncherTicket(ctx, "preview-skill");
    const cb = ctx.page.locator(
      '[data-testid="ticket-detail-launcher-skill-checkbox"][data-skill-name="alpha-skill"]',
    );
    await cb.waitFor({ state: "visible", timeout: 15000 });
    await cb.check();
    await ctx.page.waitForTimeout(500);
    const cm = ctx.page.locator('.cm-content');
    const text = await cm.textContent();
    expect(text).toContain("a");
  }, 60000);

  it("edit toggle freezes preview", async () => {
    await setupLauncherTicket(ctx, "edit-freeze");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    const textBefore = await cm.textContent();
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-template-select"]', "Other");
    await ctx.page.waitForTimeout(500);
    const textAfter = await cm.textContent();
    expect(textAfter).toBe(textBefore);
  }, 60000);
});
