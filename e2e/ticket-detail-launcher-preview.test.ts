import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  setupE2E,
} from "./fixtures.js";
import { APP_LAUNCHER, openLauncher, setupLauncherTicket } from "./ticket-detail-launcher-shared.js";

describe("Ticket detail launcher prompt preview (e2e, real server)", () => {
  const ctx = setupE2E();
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

  it("prompt preview interpolates {{launchDir}} placeholder", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tdl-dir-preview"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        ...APP_LAUNCHER,
        templates: [
          { name: "Default", text: "launch in {{launchDir}}" },
        ],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncher(ctx);
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const text = await cm.textContent();
    expect(text).toContain(project.projectPath);
    expect(text).not.toContain("{{launchDir}}");
  }, 60000);

  it("cursor stays near original position when prompt updates externally", async () => {
    await setupLauncherTicket(ctx, "cursor-preserve");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });

    const docLen = await ctx.page.evaluate(() => {
      const c = document.querySelector('.cm-content') as any;
      const view = c?.cmTile?.root?.view;
      return view ? view.state.doc.length : -1;
    });
    expect(docLen).toBeGreaterThan(20);

    const middleOffset = Math.floor(docLen / 2);
    await ctx.page.evaluate((offset) => {
      const c = document.querySelector('.cm-content') as any;
      const view = c?.cmTile?.root?.view;
      if (!view) throw new Error("CM view not found");
      view.focus();
      view.dispatch({ selection: { anchor: offset } });
    }, middleOffset);

    const cursorBefore = await ctx.page.evaluate(() => {
      const c = document.querySelector('.cm-content') as any;
      return c?.cmTile?.root?.view?.state?.selection?.main?.anchor ?? -1;
    });
    expect(cursorBefore).toBe(middleOffset);

    const cb = ctx.page.locator(
      '[data-testid="ticket-detail-launcher-skill-checkbox"][data-skill-name="alpha-skill"]',
    );
    await cb.waitFor({ state: "visible", timeout: 15000 });
    await cb.check();
    await ctx.page.waitForTimeout(500);

    const cursorAfter = await ctx.page.evaluate(() => {
      const c = document.querySelector('.cm-content') as any;
      return c?.cmTile?.root?.view?.state?.selection?.main?.anchor ?? -1;
    });

    expect(cursorAfter).toBe(middleOffset);
  }, 60000);
});
