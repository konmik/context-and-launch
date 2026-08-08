import { describe, it, expect } from "vitest";
import type { Locator } from "playwright";
import {
  openProject, openLauncherSettings, openLauncherSettingsTab,
  readBoardDefinitions, poll, setupE2E,
  type SeedBoard, type SeedTicket, type SeedAppLauncherConfig,
} from "./fixtures.js";
import { toggleToForest, forestCard, forestGroupCard } from "./forest-helpers.js";
import { testId, waitVisible } from "./locators.js";

const HERDRLESS_LAUNCHER: SeedAppLauncherConfig = {
  templates: [{ name: "Default", text: "x" }],
  skills: [],
  profiles: [{ name: "Plain", command: "echo" }],
};

async function backgroundColor(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

describe("Status swatch (e2e, real server)", () => {
  const ctx = setupE2E();

  async function setup(
    suffix: string,
    boards: SeedBoard[],
    tickets: SeedTicket[],
  ) {
    const project = await openProject(ctx, {
      slugBase: `swatch-${suffix}`,
      withBoards: boards,
      withTickets: tickets,
      appLauncherConfig: HERDRLESS_LAUNCHER,
    });
    return project;
  }

  it("assigns a Column Color in Settings, persists to boards.json, and shows the column line", async () => {
    await setup(
      "assign",
      [{ id: "kanban", name: "Kanban", columns: [{ name: "todo" }, { name: "done" }] }],
      [{ number: "T-1", title: "Alpha", status: "todo" }],
    );

    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, "columns");
    await testId(ctx.page, "launcher-settings-columns-edit-button").first().click();
    await waitVisible(ctx.page, "launcher-settings-columns-name-input");
    await ctx.page.click('[data-testid="launcher-settings-columns-color-option"][data-color-hex="#0969da"]');
    await testId(ctx.page, "launcher-settings-columns-form-submit").click();

    const boards = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => b.find((x) => x.id === "kanban")?.columns.find((c) => c.name === "todo")?.color === "#0969da",
      5000,
    );
    const todo = boards.find((b) => b.id === "kanban")?.columns.find((c) => c.name === "todo");
    expect(todo?.color).toBe("#0969da");

    await testId(ctx.page, "launcher-settings-close-button").click();
    await ctx.page.waitForTimeout(500);

    const kanbanLine = ctx.page.locator(
      '[data-testid="kanban-board-column-color-line"][data-column-name="todo"]',
    );
    await kanbanLine.waitFor({ state: "visible", timeout: 15000 });
    await expect.poll(
      () => backgroundColor(kanbanLine),
      { timeout: 15000 },
    ).toBe("rgb(9, 105, 218)");
    expect(
      await ctx.page.locator('[data-testid="kanban-board-ticket-card"] [data-testid="status-swatch"]').count(),
    ).toBe(0);

    await toggleToForest(ctx.page);
    const forestSwatch = forestCard(ctx.page, "T-1").locator('[data-testid="status-swatch"]');
    await forestSwatch.waitFor({ state: "visible", timeout: 15000 });
    expect(await backgroundColor(forestSwatch)).toBe("rgb(9, 105, 218)");
  }, 120000);

  it("renders a transparent color line and no swatch when the column has no color", async () => {
    await setup(
      "no-color",
      [{ id: "kanban", name: "Kanban", columns: [{ name: "todo" }, { name: "done" }] }],
      [{ number: "T-1", title: "Alpha", status: "done" }],
    );
    const card = testId(ctx.page, "kanban-board-ticket-card");
    await card.waitFor({ state: "visible", timeout: 15000 });
    expect(await testId(card, "status-swatch").count()).toBe(0);
    const line = ctx.page.locator(
      '[data-testid="kanban-board-column-color-line"][data-column-name="done"]',
    );
    expect(await backgroundColor(line)).toBe("rgba(0, 0, 0, 0)");
  }, 120000);

  it("shows the orphaned status on the kanban card and a destructive swatch on forest", async () => {
    await setup(
      "orphan",
      [{ id: "kanban", name: "Kanban", columns: [{ name: "todo", color: "#0969da" }, { name: "done" }] }],
      [{ number: "T-1", title: "Alpha", status: "vanished" }],
    );
    const orphanedStatus = ctx.page.locator(
      '[data-testid="kanban-board-column-body"][data-column-name="undefined"]'
      + ' [data-testid="kanban-board-ticket-orphaned-status"]',
    );
    await orphanedStatus.waitFor({ state: "visible", timeout: 15000 });
    expect(await orphanedStatus.textContent()).toBe("vanished");
    expect(
      await ctx.page.locator(
        '[data-testid="kanban-board-column-body"][data-column-name="undefined"]'
        + ' [data-testid="status-swatch"]',
      ).count(),
    ).toBe(0);

    await toggleToForest(ctx.page);
    const forestSwatch = forestCard(ctx.page, "T-1").locator('[data-testid="status-swatch"]');
    await forestSwatch.waitFor({ state: "visible", timeout: 15000 });
    expect(await forestSwatch.getAttribute("class")).toContain("bg-destructive");
  }, 120000);

  it("shows the group card's own status swatch", async () => {
    await setup(
      "group",
      [{ id: "kanban", name: "Kanban", columns: [{ name: "todo", color: "#1a7f37" }, { name: "done" }] }],
      [
        { number: "S-1", title: "Member One", status: "todo", memberOf: "S-G" },
        { number: "S-2", title: "Member Two", status: "todo", memberOf: "S-G" },
        { number: "S-G", title: "Group", status: "todo" },
      ],
    );
    await toggleToForest(ctx.page);
    const groupCard = forestGroupCard(ctx.page, "S-G");
    await groupCard.waitFor({ state: "visible", timeout: 15000 });
    const groupSwatch = testId(groupCard, "status-swatch");
    await groupSwatch.waitFor({ state: "visible", timeout: 15000 });
    expect(await backgroundColor(groupSwatch)).toBe("rgb(26, 127, 55)");
  }, 120000);

  it("clears the color when picking None", async () => {
    await setup(
      "clear",
      [{ id: "kanban", name: "Kanban", columns: [{ name: "todo", color: "#0969da" }, { name: "done" }] }],
      [{ number: "T-1", title: "Alpha", status: "todo" }],
    );

    await openLauncherSettings(ctx.page);
    await openLauncherSettingsTab(ctx.page, "columns");
    await testId(ctx.page, "launcher-settings-columns-edit-button").first().click();
    await waitVisible(ctx.page, "launcher-settings-columns-name-input");
    await testId(ctx.page, "launcher-settings-columns-color-none").click();
    await testId(ctx.page, "launcher-settings-columns-form-submit").click();

    const boards = await poll(
      () => readBoardDefinitions(ctx.testServer),
      (b) => b.find((x) => x.id === "kanban")?.columns.find((c) => c.name === "todo")?.color === undefined,
      5000,
    );
    const todo = boards.find((b) => b.id === "kanban")?.columns.find((c) => c.name === "todo");
    expect(todo?.color).toBeUndefined();

    await testId(ctx.page, "launcher-settings-close-button").click();
    const card = testId(ctx.page, "kanban-board-ticket-card");
    await card.waitFor({ state: "visible", timeout: 15000 });
    const line = ctx.page.locator(
      '[data-testid="kanban-board-column-color-line"][data-column-name="todo"]',
    );
    await expect.poll(
      () => backgroundColor(line),
      { timeout: 15000 },
    ).toBe("rgba(0, 0, 0, 0)");
  }, 120000);

  it("shows no Herdr icons without a Herdr profile", async () => {
    await setup(
      "no-herdr",
      [{ id: "kanban", name: "Kanban", columns: [{ name: "todo", color: "#0969da" }, { name: "done" }] }],
      [{ number: "T-1", title: "Alpha", status: "todo" }],
    );
    await testId(ctx.page, "kanban-board-ticket-card").first()
      .waitFor({ state: "visible", timeout: 15000 });
    expect(await testId(ctx.page, "herdr-status-icon").count()).toBe(0);

    await toggleToForest(ctx.page);
    await forestCard(ctx.page, "T-1").waitFor({ state: "visible", timeout: 15000 });
    expect(await testId(ctx.page, "herdr-status-icon").count()).toBe(0);
  }, 120000);
});
