import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import {
  createProject,
  dragSortable,
  gotoProject,
  openLauncherSettings,
  openLauncherSettingsTab,
  poll,
  readAppLauncherConfig,
  setupE2E,
  uniqueSlug,
} from "./fixtures.js";

const ITEM_SELECTORS = {
  template: {
    row: "launcher-settings-prompts-row",
    handle: "launcher-settings-prompts-drag-handle",
  },
  profile: {
    row: "launcher-settings-launch-profile-row",
    handle: "launcher-settings-launch-profile-drag-handle",
  },
  shortcut: {
    row: "launcher-settings-launch-shortcut-row",
    handle: "launcher-settings-launch-shortcut-drag-handle",
  },
} as const;

type ItemType = keyof typeof ITEM_SELECTORS;

async function dragItem(page: Page, itemType: ItemType, fromName: string, toName: string) {
  const { row, handle } = ITEM_SELECTORS[itemType];
  const sourceSelector =
    `[data-testid="${row}"][data-item-name="${fromName}"] [data-testid="${handle}"]`;
  const targetSelector = `[data-testid="${row}"][data-item-name="${toName}"]`;
  await page.locator(sourceSelector).waitFor({ state: "visible", timeout: 15000 });
  await page.locator(targetSelector).scrollIntoViewIfNeeded();
  await dragSortable(
    page,
    sourceSelector,
    targetSelector,
  );
}

async function itemNames(page: Page, itemType: ItemType): Promise<string[]> {
  return page.locator(`[data-testid="${ITEM_SELECTORS[itemType].row}"]`).evaluateAll(
    (elements) => elements.map(element => element.getAttribute("data-item-name") ?? ""),
  );
}

describe("Launcher Settings item reorder (e2e, real server)", () => {
  const ctx = setupE2E();

  it("reorders prompt templates, agents, and shortcuts and persists their order", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("settings-item-reorder"),
      appLauncherConfig: {
        templates: [
          { name: "Template A", text: "a" },
          { name: "Template B", text: "b" },
          { name: "Template C", text: "c" },
        ],
        profiles: [
          { name: "Agent A", command: "echo a" },
          { name: "Agent B", command: "echo b" },
          { name: "Agent C", command: "echo c" },
        ],
        shortcuts: [
          { name: "Shortcut A", command: "echo a" },
          { name: "Shortcut B", command: "echo b" },
          { name: "Shortcut C", command: "echo c" },
        ],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openLauncherSettings(ctx.page);

    await openLauncherSettingsTab(ctx.page, "prompts");
    await dragItem(ctx.page, "template", "Template A", "Template C");
    expect(await itemNames(ctx.page, "template")).toEqual([
      "Template B", "Template C", "Template A",
    ]);

    await openLauncherSettingsTab(ctx.page, "launch");
    await dragItem(ctx.page, "profile", "Agent A", "Agent C");
    await dragItem(ctx.page, "shortcut", "Shortcut A", "Shortcut C");
    expect(await itemNames(ctx.page, "profile")).toEqual(["Agent B", "Agent C", "Agent A"]);
    expect(await itemNames(ctx.page, "shortcut")).toEqual([
      "Shortcut B", "Shortcut C", "Shortcut A",
    ]);

    const appConfig = await poll(
      () => readAppLauncherConfig(ctx.testServer),
      config => (
        config?.templates?.find(item => item.name === "Template A")?.order === 3
        && config?.profiles?.find(item => item.name === "Agent A")?.order === 3
        && config?.shortcuts?.find(item => item.name === "Shortcut A")?.order === 3
      ),
      5000,
    );
    expect(appConfig?.templates?.find(item => item.name === "Template A")?.order).toBe(3);
    expect(appConfig?.profiles?.find(item => item.name === "Agent A")?.order).toBe(3);
    expect(appConfig?.shortcuts?.find(item => item.name === "Shortcut A")?.order).toBe(3);
  }, 60000);
});
