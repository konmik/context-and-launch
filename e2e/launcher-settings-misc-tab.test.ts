import { describe, it, expect } from "vitest";
import {
  expectOpenConfigDirRequest,
  readProjectLauncherConfig, readProjectRegistry, poll,
  setupE2E,
} from "./fixtures.js";
import { APP_BOARDS, openSettingsTab } from "./launcher-settings-shared.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Launcher Settings Misc tab (e2e, real server)", () => {
  const ctx = setupE2E();

  const setup = (suffix: string) => openSettingsTab(ctx, {
    slugBase: `lsg-${suffix}`,
    tab: "misc",
    withBoards: APP_BOARDS,
  });

  it("opens settings panel and shows Misc tab", async () => {
    await setup("opens");
    expect(await testId(ctx.page, "launcher-settings-tab-misc").count()).toBe(1);
  });

  it("opens as a labelled dialog and moves focus inside", async () => {
    await setup("accessible-dialog");
    const dialog = ctx.page.getByRole("dialog", { name: "Settings" });

    expect(await dialog.count()).toBe(1);
    expect(await dialog.getByRole("button", { name: "Close window" }).count()).toBe(1);
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  });

  it("traps focus among controls in the active tab", async () => {
    await setup("focus-trap");
    const dialog = ctx.page.getByRole("dialog", { name: "Settings" });
    const focusable = dialog.locator(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), "
        + "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ).filter({ visible: true });
    const first = focusable.first();
    await focusable.last().focus();
    await ctx.page.keyboard.press("Tab");

    expect(await first.evaluate((element) => element === document.activeElement)).toBe(true);
  });

  it("keeps the window inside the viewport when dragged", async () => {
    await setup("drag-bounds");
    const panel = ctx.page.locator('[data-scope="floating-panel"][data-part="content"]');
    const dragStrip = ctx.page.locator('[data-scope="floating-panel"][data-part="drag-trigger"]');
    const stripBox = await dragStrip.boundingBox();
    if (!stripBox) throw new Error("Settings drag control is not visible");
    const startX = stripBox.x + stripBox.width / 2;
    const startY = stripBox.y + stripBox.height / 2;
    await ctx.page.mouse.move(startX, startY);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(startX + 2_000, startY + 2_000, { steps: 20 });
    await ctx.page.mouse.up();

    const box = await panel.boundingBox();
    const viewport = ctx.page.viewportSize();
    if (!box || !viewport) throw new Error("Settings window geometry is unavailable");
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  it("Escape cancels an active resize without closing Settings", async () => {
    await setup("cancel-resize");
    const panel = ctx.page.locator('[data-scope="floating-panel"][data-part="content"]');
    const handle = ctx.page.locator('[data-scope="floating-panel"][data-part="resize-trigger"]');
    const before = await panel.boundingBox();
    const handleBox = await handle.boundingBox();
    if (!before || !handleBox) throw new Error("Settings resize control is not visible");
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await ctx.page.mouse.move(startX, startY);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(startX - 80, startY - 80, { steps: 10 });
    await ctx.page.keyboard.press("Escape");
    await ctx.page.mouse.up();

    const after = await panel.boundingBox();
    expect(await ctx.page.getByRole("dialog", { name: "Settings" }).count()).toBe(1);
    expect(after?.width).toBe(before.width);
    expect(after?.height).toBe(before.height);
  });

  it("preserves its resized geometry after closing and reopening", async () => {
    await setup("persists-geometry");
    const panel = ctx.page.locator('[data-scope="floating-panel"][data-part="content"]');
    const handle = ctx.page.locator('[data-scope="floating-panel"][data-part="resize-trigger"]');
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("Settings resize control is not visible");
    await ctx.page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(handleBox.x - 60, handleBox.y - 60, { steps: 10 });
    await ctx.page.mouse.up();
    const resized = await panel.boundingBox();

    await testId(ctx.page, "launcher-settings-close-button").click();
    await testId(ctx.page, "project-header-settings-button").click();
    const reopened = await panel.boundingBox();

    expect(reopened?.width).toBe(resized?.width);
    expect(reopened?.height).toBe(resized?.height);
  });

  it("fits itself back into a smaller viewport", async () => {
    await setup("viewport-resize");
    await ctx.page.setViewportSize({ width: 600, height: 400 });
    const box = await ctx.page.locator(
      '[data-scope="floating-panel"][data-part="content"]',
    ).boundingBox();

    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(600);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(400);
  });

  it("clips settings content to the floating window border", async () => {
    await setup("clips-content");
    const boundary = await ctx.page.locator(
      '[data-scope="floating-panel"][data-part="viewport"]',
    ).evaluate((element) => {
      const style = getComputedStyle(element);
      return { overflow: style.overflow, padding: style.padding };
    });

    expect(boundary).toEqual({ overflow: "clip", padding: "1px" });
  });

  it("keeps overflowing settings content scrollable", async () => {
    await setup("scrolls-content");
    const panel = ctx.page.locator('[data-scope="floating-panel"][data-part="content"]');
    const resizeHandle = ctx.page.locator(
      '[data-scope="floating-panel"][data-part="resize-trigger"]',
    );
    const beforeResize = await panel.boundingBox();
    const handleBox = await resizeHandle.boundingBox();
    if (!beforeResize || !handleBox) throw new Error("Settings resize control is not visible");
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await ctx.page.mouse.move(startX, startY);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(startX, startY - 300, { steps: 20 });
    await ctx.page.mouse.up();

    const afterResize = await panel.boundingBox();
    const scroller = testId(ctx.page, "launcher-settings-scroll");
    const dimensions = await scroller.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });

    expect(afterResize?.height).toBeLessThan(beforeResize.height);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  it("project name input persists on blur", async () => {
    const project = await setup("pname");
    const input = testId(ctx.page, "launcher-settings-misc-project-name-input");
    await input.fill("Custom Name");
    await input.blur();
    const registry = await poll(
      () => readProjectRegistry(ctx.testServer),
      (r) => r.projects.find(
        (p: { projectSlug: string }) => p.projectSlug === project.projectSlug,
      )?.name === "Custom Name",
      5000,
    );
    const entry = registry.projects.find(
      (p: { projectSlug: string }) => p.projectSlug === project.projectSlug,
    );
    expect(entry?.name).toBe("Custom Name");
  });

  it("saves a blank branch prefix without sending undefined to the server", async () => {
    await setup("serializable-save-arguments");
    const input = testId(ctx.page, "launcher-settings-misc-branch-prefix-input");
    const titleBox = await ctx.page.getByRole("heading", { name: "Settings" }).boundingBox();
    if (!titleBox) throw new Error("Settings title is not visible");
    await input.focus();
    const saveResponse = ctx.page.waitForResponse((response) =>
      response.request().method() === "POST"
      && !!response.request().headers()["x-server-function-id"]);
    await ctx.page.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await saveResponse;

    expect(await ctx.page.getByText(
      "Server function arguments are sent as JSON",
      { exact: false },
    ).count()).toBe(0);
  });

  it("launcher-settings-open-user-config fires open-config-dir request", async () => {
    await setup("open-user");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-user-config"]'));
  });

  it("launcher-settings-open-project-config fires open-config-dir request", async () => {
    await setup("open-proj");
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="launcher-settings-open-project-config"]'));
  });

  it("launcher-settings-close-button hides the floating panel", async () => {
    await setup("close");
    await testId(ctx.page, "launcher-settings-close-button").click();
    await waitGone(ctx.page, "launcher-settings-tab-misc");
  });

  it("launcher-settings-misc-worktree-input persists on Enter", async () => {
    const project = await setup("wt-input");
    await testId(ctx.page, "launcher-settings-misc-worktree-input").fill("/tmp/some-wt-path-for-test",
    );
    await testId(ctx.page, "launcher-settings-misc-worktree-input").press("Enter");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.worktreeRootPath === "/tmp/some-wt-path-for-test",
      5000,
    );
    expect(cfg?.worktreeRootPath).toBe("/tmp/some-wt-path-for-test");
  });

  it("launcher-settings-misc-worktree-browse button exists", async () => {
    await setup("wt-browse");
    await waitVisible(ctx.page, "launcher-settings-misc-worktree-browse");
    expect(await testId(ctx.page, "launcher-settings-misc-worktree-browse").count()).toBe(1);
  });

  it("branch prefix input persists on blur", async () => {
    const project = await setup("bprefix");
    const input = ctx.page.locator(
      '[data-testid="launcher-settings-misc-branch-prefix-input"]',
    );
    await input.fill("feature/");
    await input.blur();
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.branchPrefix === "feature/",
      5000,
    );
    expect(cfg?.branchPrefix).toBe("feature/");
  });

  it("launcher-settings-misc-conflict-prompt persists on blur", async () => {
    const project = await setup("cprompt");
    await testId(ctx.page, "launcher-settings-misc-conflict-prompt").fill("my custom prompt",
    );
    await testId(ctx.page, "launcher-settings-misc-conflict-prompt").blur();
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.conflictResolutionPrompt === "my custom prompt",
      5000,
    );
    expect(cfg?.conflictResolutionPrompt).toBe("my custom prompt");
  });
});
