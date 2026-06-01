import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject,
  openLauncherSettings, openLauncherSettingsTab,
  readBoardDefinitions, readProjectRegistry,
  setupE2E,
} from "./fixtures.js";

const APP_BOARDS = [
  { id: "kanban", name: "Kanban", columns: [{ name: "todo" }, { name: "in-progress" }, { name: "done" }] },
  { id: "simple", name: "Simple", columns: [{ name: "todo" }, { name: "done" }] },
];

describe("Launcher Settings Columns tab (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(suffix: string) {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug(`lsc-${suffix}`),
      withBoards: APP_BOARDS,
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, "columns");
    return project;
  }

  it("renders board selector, action buttons, column rows", async () => {
    await setup("renders");
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-board-selector"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-set-project-board-btn"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-add-board-btn"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-delete-board-btn"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-add-column-btn"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-row"]').count()).toBeGreaterThan(0);
  }, 60000);

  it("add-board opens form; submit creates new board", async () => {
    await setup("add-board");
    await ctx.page.click('[data-testid="launcher-settings-columns-add-board-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-board-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-columns-board-name-input"]', "Sprint Board");
    await ctx.page.click('[data-testid="launcher-settings-columns-board-form-submit"]');
    await ctx.page.waitForTimeout(1000);
    const boards = readBoardDefinitions(ctx.testServer);
    expect(boards.map((b) => b.name)).toContain("Sprint Board");
  }, 60000);

  it("board form cancel closes without writing", async () => {
    await setup("add-board-cancel");
    await ctx.page.click('[data-testid="launcher-settings-columns-add-board-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-board-form-cancel"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="launcher-settings-columns-board-form-cancel"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-board-name-input"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("delete-board opens confirm and removes the board", async () => {
    await setup("del-board");
    await ctx.page.selectOption('[data-testid="launcher-settings-columns-board-selector"]', "simple");
    await ctx.page.click('[data-testid="launcher-settings-columns-delete-board-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-delete-confirm-message"]', {
      state: "visible", timeout: 15000,
    });
    expect(
      await ctx.page.textContent('[data-testid="launcher-settings-columns-delete-confirm-message"]'),
    ).toContain("Delete board");
    await ctx.page.click('[data-testid="launcher-settings-columns-delete-confirm-btn"]');
    await ctx.page.waitForTimeout(1000);
    const boards = readBoardDefinitions(ctx.testServer);
    expect(boards.map((b) => b.id)).not.toContain("simple");
  }, 60000);

  it("delete-cancel keeps board", async () => {
    await setup("del-cancel");
    await ctx.page.selectOption('[data-testid="launcher-settings-columns-board-selector"]', "simple");
    await ctx.page.click('[data-testid="launcher-settings-columns-delete-board-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-delete-cancel"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="launcher-settings-columns-delete-cancel"]');
    await ctx.page.waitForTimeout(500);
    const boards = readBoardDefinitions(ctx.testServer);
    expect(boards.map((b) => b.id)).toContain("simple");
  }, 60000);

  it("add-column opens form; submit adds new column to current board", async () => {
    await setup("add-col");
    await ctx.page.click('[data-testid="launcher-settings-columns-add-column-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-columns-name-input"]', "Code Review");
    expect(
      await ctx.page.textContent('[data-testid="launcher-settings-columns-slug-preview"]'),
    ).toContain("code-review");
    await ctx.page.fill('[data-testid="launcher-settings-columns-desc-input"]', "Awaiting review");
    await ctx.page.click('[data-testid="launcher-settings-columns-form-submit"]');
    await ctx.page.waitForTimeout(1000);
    const boards = readBoardDefinitions(ctx.testServer);
    const kanban = boards.find((b) => b.id === "kanban");
    expect(kanban?.columns.map((c) => c.name)).toContain("code-review");
  }, 60000);

  it("validation error for reserved 'undefined' column name", async () => {
    await setup("validate-undef");
    await ctx.page.click('[data-testid="launcher-settings-columns-add-column-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-columns-name-input"]', "undefined");
    expect(
      await ctx.page.textContent('[data-testid="launcher-settings-columns-name-error"]'),
    ).toContain("reserved");
  }, 60000);

  it("form-cancel closes column form", async () => {
    await setup("form-cancel");
    await ctx.page.click('[data-testid="launcher-settings-columns-add-column-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-form-cancel"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="launcher-settings-columns-form-cancel"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-name-input"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("column edit opens form; rename flow shows scope options and confirm renames", async () => {
    const project = await setup("rename");
    await ctx.page.locator('[data-testid="launcher-settings-columns-edit-button"]').first().click();
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-columns-name-input"]', "backlog");
    await ctx.page.click('[data-testid="launcher-settings-columns-form-submit"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-rename-scope-all"]', {
      state: "visible", timeout: 15000,
    });
    expect(
      await ctx.page.locator('[data-testid="launcher-settings-columns-rename-scope-current"]').count(),
    ).toBe(1);
    expect(
      await ctx.page.locator('[data-testid="launcher-settings-columns-rename-scope-none"]').count(),
    ).toBe(1);
    await ctx.page.click('[data-testid="launcher-settings-columns-rename-scope-none"]');
    await ctx.page.click('[data-testid="launcher-settings-columns-rename-confirm"]');
    await ctx.page.waitForTimeout(1000);
    const boards = readBoardDefinitions(ctx.testServer);
    const kanban = boards.find((b) => b.id === "kanban");
    expect(kanban?.columns.map((c) => c.name)).toContain("backlog");
    void project;
  }, 60000);

  it("rename dialog cancel keeps column name", async () => {
    await setup("rename-cancel");
    await ctx.page.locator('[data-testid="launcher-settings-columns-edit-button"]').first().click();
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-name-input"]', { timeout: 15000 });
    await ctx.page.fill('[data-testid="launcher-settings-columns-name-input"]', "backlog");
    await ctx.page.click('[data-testid="launcher-settings-columns-form-submit"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-rename-cancel"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="launcher-settings-columns-rename-cancel"]');
    await ctx.page.waitForTimeout(500);
    const boards = readBoardDefinitions(ctx.testServer);
    const kanban = boards.find((b) => b.id === "kanban");
    expect(kanban?.columns.map((c) => c.name)).toContain("todo");
  }, 60000);

  it("column delete-button removes column", async () => {
    await setup("delete-col");
    const beforeBoards = readBoardDefinitions(ctx.testServer);
    const kanbanBefore = beforeBoards.find((b) => b.id === "kanban");
    const initialCount = kanbanBefore?.columns.length ?? 0;
    await ctx.page.locator('[data-testid="launcher-settings-columns-delete-button"]').first().click();
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-delete-confirm-btn"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="launcher-settings-columns-delete-confirm-btn"]');
    await ctx.page.waitForTimeout(1000);
    const after = readBoardDefinitions(ctx.testServer);
    const kanbanAfter = after.find((b) => b.id === "kanban");
    expect(kanbanAfter?.columns.length).toBe(initialCount - 1);
  }, 60000);

  it("set-project-board-btn opens confirm; confirm sets project boardId, cancel does not", async () => {
    const project = await setup("setproj");
    await ctx.page.selectOption('[data-testid="launcher-settings-columns-board-selector"]', "simple");
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-set-project-board-btn"]:not(:disabled)', {
      timeout: 15000,
    });
    await ctx.page.click('[data-testid="launcher-settings-columns-set-project-board-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-set-project-board-message"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="launcher-settings-columns-set-project-board-cancel-btn"]');
    await ctx.page.waitForTimeout(500);
    const registryBefore = readProjectRegistry(ctx.testServer);
    const entryBefore = registryBefore.projects.find((p) => p.projectSlug === project.projectSlug);
    expect(entryBefore?.boardId).toBeFalsy();

    await ctx.page.click('[data-testid="launcher-settings-columns-set-project-board-btn"]');
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-set-project-board-confirm-btn"]', {
      timeout: 15000,
    });
    await ctx.page.click('[data-testid="launcher-settings-columns-set-project-board-confirm-btn"]');
    await ctx.page.waitForTimeout(800);
    const registryAfter = readProjectRegistry(ctx.testServer);
    const entryAfter = registryAfter.projects.find((p) => p.projectSlug === project.projectSlug);
    expect(entryAfter?.boardId).toBe("simple");
  }, 60000);

  it("columns drag handle exists (reordering covered elsewhere)", async () => {
    await setup("drag-handle");
    expect(await ctx.page.locator('[data-testid="launcher-settings-columns-drag-handle"]').count()).toBeGreaterThan(0);
  }, 60000);

  it("tab triggers for all 4 launcher settings tabs exist", async () => {
    await setup("tabs");
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-launch"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-prompts"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-misc"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="launcher-settings-tab-columns"]').count()).toBe(1);
  }, 60000);
});
