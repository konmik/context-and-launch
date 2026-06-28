import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  readProjectLauncherConfig,
  setupE2E,
} from "./fixtures.js";

const APP_LAUNCHER = {
  templates: [
    { name: "Default", text: "<<ENTER>>\ndo it in {{ticketDir}}\n\n{{skills}}\n<<ENTER>>" },
    { name: "Other", text: "other {{ticketDir}}\n<<ENTER>>" },
  ],
  profiles: [
    { name: "Claude", command: "echo claude" },
    { name: "GPT", command: "echo gpt" },
  ],
  skills: [
    { name: "alpha-skill", text: "a" },
    { name: "bravo-skill", text: "b" },
  ],
};

describe("Ticket detail Launcher tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openLauncher() {
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-tab-launcher"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-launcher-run-button"]', {
      state: "visible", timeout: 15000,
    });
  }

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`tdl-${suffix}`),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: APP_LAUNCHER,
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncher();
    return project;
  }

  it("profile select persists selection to project launcher config", async () => {
    const project = await setup("profile");
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-profile-select"]', "GPT");
    await ctx.page.waitForTimeout(500);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.columnDefaults?.["todo"]?.profileName).toBe("GPT");
  }, 60000);

  it("template select persists selection to project launcher config", async () => {
    const project = await setup("template");
    await ctx.page.selectOption('[data-testid="ticket-detail-launcher-template-select"]', "Other");
    await ctx.page.waitForTimeout(500);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.columnDefaults?.["todo"]?.templateName).toBe("Other");
  }, 60000);

  it("skill checkbox toggle persists to project launcher config", async () => {
    const project = await setup("skill-toggle");
    const cb = ctx.page.locator(
      '[data-testid="ticket-detail-launcher-skill-checkbox"][data-skill-name="alpha-skill"]',
    );
    await cb.waitFor({ state: "visible", timeout: 15000 });
    await cb.check();
    await ctx.page.waitForTimeout(500);
    const cfg = readProjectLauncherConfig(ctx.testServer, project.projectSlug);
    expect(cfg?.columnDefaults?.["todo"]?.checkedSkills).toContain("alpha-skill");
  }, 60000);

  it("run button is clickable and triggers an HTTP request", async () => {
    await setup("run");
    let aiRunRequest = false;
    ctx.page.on("request", (req) => {
      if (req.url().includes("/_server")) aiRunRequest = true;
    });
    await ctx.page.click('[data-testid="ticket-detail-launcher-run-button"]');
    await ctx.page.waitForTimeout(2000);
    expect(aiRunRequest).toBe(true);
  }, 60000);

  it("reference-only: warning and dirty-worktree dialog testids are absent on happy path", async () => {
    await setup("ref-only");
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-warning"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-dirty-cancel"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-launcher-dirty-launch-anyway"]').count()).toBe(0);
  }, 60000);

  it("prompt preview shows interpolated template text", async () => {
    const project = await setup("preview-text");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const text = await cm.textContent();
    expect(text).toContain("do it in");
    expect(text).not.toContain("{{ticketDir}}");
    expect(text).toContain(project.projectSlug);
  }, 60000);

  it("prompt preview updates when template selection changes", async () => {
    await setup("preview-change");
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
    await setup("preview-skill");
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
    await setup("edit-freeze");
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

  it("edit toggle off discards edits", async () => {
    await setup("edit-discard");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const originalText = await cm.textContent();
    const toggle = ctx.page.locator('[data-testid="prompt-preview-edit-toggle"]');
    await toggle.check();
    await ctx.page.waitForTimeout(200);
    await cm.click();
    await ctx.page.keyboard.type("EXTRA TEXT");
    await ctx.page.waitForTimeout(200);
    const editedText = await cm.textContent();
    expect(editedText).toContain("EXTRA TEXT");
    await toggle.uncheck();
    await ctx.page.waitForTimeout(200);
    const revertedText = await cm.textContent();
    expect(revertedText).not.toContain("EXTRA TEXT");
    expect(revertedText).toBe(originalText);
  }, 60000);

  it("prompt preview shows <<ENTER>> markers", async () => {
    await setup("enter-markers");
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const text = await cm.textContent();
    expect(text).toContain("<<ENTER>>");
  }, 60000);

  it("launch dir display shows project path when worktree is off", async () => {
    const project = await setup("dir-off");
    const display = ctx.page.locator('[data-testid="launch-dir-display"]');
    await display.waitFor({ state: "visible", timeout: 15000 });
    const text = await display.textContent();
    expect(text).toContain(project.projectPath);
    expect(await ctx.page.locator('[data-testid="launch-dir-copy-button"]').count()).toBe(1);
  }, 60000);

  it("launch dir display updates when worktree toggle changes", async () => {
    const project = await setup("dir-toggle");
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

  it("cursor stays near original position when prompt updates externally", async () => {
    await setup("cursor-preserve");
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
    await openLauncher();
    const cm = ctx.page.locator('.cm-content');
    await cm.waitFor({ state: "visible", timeout: 15000 });
    const text = await cm.textContent();
    expect(text).toContain(project.projectPath);
    expect(text).not.toContain("{{launchDir}}");
  }, 60000);
});
