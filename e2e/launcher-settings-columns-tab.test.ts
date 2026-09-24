import { describe, it, expect } from "vitest";
import {
  readBoardDefinitions, readProjectRegistry, poll,
  setupE2E, openProject, openLauncherSettings, openLauncherSettingsTab, readTicketStatus,
} from "./fixtures.js";
import { APP_BOARDS, openSettingsTab } from "./launcher-settings-shared.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Launcher Settings Columns tab (e2e, real server)", () => {
  const ctx = setupE2E();

  const setup = (suffix: string) => openSettingsTab(ctx, {
    slugBase: `lsc-${suffix}`,
    tab: "columns",
    withBoards: APP_BOARDS,
  });

  it("renders board selector, action buttons, column rows", async () => {
    await setup("renders");
    expect(await testId(ctx.page, "launcher-settings-columns-board-selector").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-columns-set-project-board-btn").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-columns-add-board-btn").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-columns-delete-board-btn").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-columns-add-column-btn").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-columns-row").count()).toBeGreaterThan(0);
  });

  it("add-board opens form; submit creates new board", async () => {
    await setup("add-board");
    await testId(ctx.page, "launcher-settings-columns-add-board-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-board-name-input");
    await testId(ctx.page, "launcher-settings-columns-board-name-input").fill("Sprint Board");
    await testId(ctx.page, "launcher-settings-columns-board-form-submit").click();
    const boards = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => b.map((x) => x.name).includes("Sprint Board"),
      15000,
    );
    expect(boards.map((b) => b.name)).toContain("Sprint Board");
  });

  it("board form cancel closes without writing", async () => {
    await setup("add-board-cancel");
    await testId(ctx.page, "launcher-settings-columns-add-board-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-board-form-cancel");
    await testId(ctx.page, "launcher-settings-columns-board-form-cancel").click();
    await waitGone(ctx.page, "launcher-settings-columns-board-name-input");
  });

  it("delete-board opens confirm and removes the board", async () => {
    const project = await setup("del-board");
    await ctx.page.selectOption('[data-testid="launcher-settings-columns-board-selector"]', "simple");
    await testId(ctx.page, "launcher-settings-columns-set-project-board-btn").click();
    await testId(ctx.page, "launcher-settings-columns-set-project-board-confirm-btn").click();
    await waitGone(ctx.page, "launcher-settings-columns-set-project-board-message");
    await testId(ctx.page, "launcher-settings-columns-delete-board-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-delete-confirm-message");
    expect(
      await ctx.page.textContent('[data-testid="launcher-settings-columns-delete-confirm-message"]'),
    ).toContain("Delete board");
    await testId(ctx.page, "launcher-settings-columns-delete-confirm-btn").click();
    const boards = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => !b.map((x) => x.id).includes("simple"),
      5000,
    );
    expect(boards.map((b) => b.id)).not.toContain("simple");
    const registry = await poll(() => readProjectRegistry(ctx.testServer), registry =>
      !registry.projects.find(p => p.projectSlug === project.projectSlug)?.boardId, 5000);
    expect(registry.projects.find(p => p.projectSlug === project.projectSlug)?.boardId).toBeUndefined();
    await ctx.page.waitForFunction(() =>
      document.querySelector<HTMLSelectElement>('[data-testid="launcher-settings-columns-board-selector"]')
        ?.value === 'kanban');
  });

  it("delete-cancel keeps board", async () => {
    await setup("del-cancel");
    await ctx.page.selectOption('[data-testid="launcher-settings-columns-board-selector"]', "simple");
    await testId(ctx.page, "launcher-settings-columns-delete-board-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-delete-cancel");
    await testId(ctx.page, "launcher-settings-columns-delete-cancel").click();
    await ctx.page.waitForTimeout(500);
    const boards = readBoardDefinitions(ctx.testServer);
    expect(boards.map((b) => b.id)).toContain("simple");
  });

  it("add-column opens form; submit adds new column to current board", async () => {
    await setup("add-col");
    await testId(ctx.page, "launcher-settings-columns-add-column-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-name-input");
    await testId(ctx.page, "launcher-settings-columns-name-input").fill("Code Review");
    expect(
      await ctx.page.textContent('[data-testid="launcher-settings-columns-slug-preview"]'),
    ).toContain("code-review");
    await testId(ctx.page, "launcher-settings-columns-desc-input").fill("Awaiting review");
    await testId(ctx.page, "launcher-settings-columns-form-submit").click();
    const boards = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => b.find((x) => x.id === "kanban")?.columns.map((c) => c.name).includes("code-review") ?? false,
      5000,
    );
    const kanban = boards.find((b) => b.id === "kanban");
    expect(kanban?.columns.map((c) => c.name)).toContain("code-review");
    const headers = await poll(() => testId(ctx.page, 'kanban-board-column-header').allTextContents(),
      names => names.includes('code-review'), 5000);
    expect(headers).toContain('code-review');
  });

  it("validation error for reserved 'undefined' column name", async () => {
    await setup("validate-undef");
    await testId(ctx.page, "launcher-settings-columns-add-column-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-name-input");
    await testId(ctx.page, "launcher-settings-columns-name-input").fill("undefined");
    expect(
      await ctx.page.textContent('[data-testid="launcher-settings-columns-name-error"]'),
    ).toContain("reserved");
  });

  it("form-cancel closes column form", async () => {
    await setup("form-cancel");
    await testId(ctx.page, "launcher-settings-columns-add-column-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-form-cancel");
    await testId(ctx.page, "launcher-settings-columns-form-cancel").click();
    await waitGone(ctx.page, "launcher-settings-columns-name-input");
  });

  it("column edit opens form; rename flow shows scope options and confirm renames", async () => {
    const project = await setup("rename");
    await testId(ctx.page, "launcher-settings-columns-edit-button").first().click();
    await waitVisible(ctx.page, "launcher-settings-columns-name-input");
    await testId(ctx.page, "launcher-settings-columns-name-input").fill("backlog");
    await testId(ctx.page, "launcher-settings-columns-form-submit").click();
    await waitVisible(ctx.page, "launcher-settings-columns-rename-scope-all");
    expect(
      await testId(ctx.page, "launcher-settings-columns-rename-scope-current").count(),
    ).toBe(1);
    expect(
      await testId(ctx.page, "launcher-settings-columns-rename-scope-none").count(),
    ).toBe(1);
    await testId(ctx.page, "launcher-settings-columns-rename-scope-none").click();
    await testId(ctx.page, "launcher-settings-columns-rename-confirm").click();
    const boards = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => b.find((x) => x.id === "kanban")?.columns.map((c) => c.name).includes("backlog") ?? false,
      5000,
    );
    const kanban = boards.find((b) => b.id === "kanban");
    expect(kanban?.columns.map((c) => c.name)).toContain("backlog");
    void project;
  });

  it("rename dialog cancel keeps column name", async () => {
    await setup("rename-cancel");
    await testId(ctx.page, "launcher-settings-columns-edit-button").first().click();
    await waitVisible(ctx.page, "launcher-settings-columns-name-input");
    await testId(ctx.page, "launcher-settings-columns-name-input").fill("backlog");
    await testId(ctx.page, "launcher-settings-columns-form-submit").click();
    await waitVisible(ctx.page, "launcher-settings-columns-rename-cancel");
    await testId(ctx.page, "launcher-settings-columns-rename-cancel").click();
    await ctx.page.waitForTimeout(500);
    const boards = readBoardDefinitions(ctx.testServer);
    const kanban = boards.find((b) => b.id === "kanban");
    expect(kanban?.columns.map((c) => c.name)).toContain("todo");
  });

  it('migrates ticket status when renaming a column for the current project', async () => {
    const project = await openProject(ctx, {
      slugBase: 'lsc-migrate', withBoards: APP_BOARDS,
      withTickets: [{ number: 'T-1', title: 'Alpha', status: 'todo' }],
    });
    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, 'columns');
    await testId(ctx.page, 'launcher-settings-columns-edit-button').first().click();
    await testId(ctx.page, 'launcher-settings-columns-name-input').fill('backlog');
    await testId(ctx.page, 'launcher-settings-columns-form-submit').click();
    await testId(ctx.page, 'launcher-settings-columns-rename-scope-current').click();
    await testId(ctx.page, 'launcher-settings-columns-rename-confirm').click();
    const ticket = await poll(() => readTicketStatus(ctx.testServer, project.projectSlug, 't-1-alpha'),
      ticket => ticket?.status === 'backlog', 5000);
    expect(ticket?.status).toBe('backlog');
  });

  it("column delete-button removes column", async () => {
    await setup("delete-col");
    const beforeBoards = readBoardDefinitions(ctx.testServer);
    const kanbanBefore = beforeBoards.find((b) => b.id === "kanban");
    const initialCount = kanbanBefore?.columns.length ?? 0;
    await testId(ctx.page, "launcher-settings-columns-delete-button").first().click();
    await waitVisible(ctx.page, "launcher-settings-columns-delete-confirm-btn");
    await testId(ctx.page, "launcher-settings-columns-delete-confirm-btn").click();
    const after = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => (b.find((x) => x.id === "kanban")?.columns.length ?? -1) === initialCount - 1,
      5000,
    );
    const kanbanAfter = after.find((b) => b.id === "kanban");
    expect(kanbanAfter?.columns.length).toBe(initialCount - 1);
  });

  it("set-project-board-btn opens confirm; confirm sets project boardId, cancel does not", async () => {
    const project = await setup("setproj");
    await ctx.page.selectOption('[data-testid="launcher-settings-columns-board-selector"]', "simple");
    await ctx.page.waitForSelector('[data-testid="launcher-settings-columns-set-project-board-btn"]:not(:disabled)', {
      timeout: 15000,
    });
    await testId(ctx.page, "launcher-settings-columns-set-project-board-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-set-project-board-message");
    await testId(ctx.page, "launcher-settings-columns-set-project-board-cancel-btn").click();
    await ctx.page.waitForTimeout(500);
    const registryBefore = readProjectRegistry(ctx.testServer);
    const entryBefore = registryBefore.projects.find((p) => p.projectSlug === project.projectSlug);
    expect(entryBefore?.boardId).toBeFalsy();

    await testId(ctx.page, "launcher-settings-columns-set-project-board-btn").click();
    await waitVisible(ctx.page, "launcher-settings-columns-set-project-board-confirm-btn");
    await testId(ctx.page, "launcher-settings-columns-set-project-board-confirm-btn").click();
    // The dialog closes only after the save resolves, so its disappearance is the
    // app's own signal that the registry has been written.
    await waitGone(ctx.page, "launcher-settings-columns-set-project-board-message");
    const registryAfter = readProjectRegistry(ctx.testServer);
    const entryAfter = registryAfter.projects.find((p) => p.projectSlug === project.projectSlug);
    expect(entryAfter?.boardId).toBe("simple");
  });

  it("columns drag handle exists (reordering covered elsewhere)", async () => {
    await setup("drag-handle");
    expect(await testId(ctx.page, "launcher-settings-columns-drag-handle").count()).toBeGreaterThan(0);
  });

  it("tab triggers for all 4 launcher settings tabs exist", async () => {
    await setup("tabs");
    expect(await testId(ctx.page, "launcher-settings-tab-launch").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-tab-prompts").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-tab-misc").count()).toBe(1);
    expect(await testId(ctx.page, "launcher-settings-tab-columns").count()).toBe(1);
  });
});
