import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  readProjectRegistry, getLocalStorageItem, setupE2E,
} from "./fixtures.js";
import { createScratchRepo, gitBranches } from "./git-fixtures.js";
import { countOf, testId, waitVisible } from "./locators.js";

describe("Add project welcome screen (e2e, real server)", () => {
  const ctx = setupE2E();
  const scratchRepos: string[] = [];

  /** A repo the welcome screen can register, fresh per test so none share state. */
  function scratchRepo(): string {
    const dir = createScratchRepo("cl-addproj-repo-");
    scratchRepos.push(dir);
    return dir;
  }

  afterAll(() => {
    for (const dir of scratchRepos) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function gotoAddProject(): Promise<void> {
    await ctx.page.goto(`${ctx.testServer.baseUrl}/add-project`);
  }

  it("palette-picker mode toggle switches class and writes localStorage", async () => {
    await gotoAddProject();
    await waitVisible(ctx.page, "palette-picker-trigger");
    const before = await ctx.page.evaluate(() => document.documentElement.classList.contains("dark"));
    await testId(ctx.page, "palette-picker-trigger").click();
    await testId(ctx.page, "palette-picker-mode-toggle").click();
    await ctx.page.waitForFunction(
      (was) => document.documentElement.classList.contains("dark") !== was,
      before, { timeout: 3000 },
    );
    const theme = await getLocalStorageItem(ctx.page, "theme");
    expect(theme === "light" || theme === "dark").toBe(true);
  });

  it("project name input is empty by default and editable", async () => {
    await gotoAddProject();
    await waitVisible(ctx.page, "add-project-name-input");
    const input = testId(ctx.page, "add-project-name-input");
    expect(await input.inputValue()).toBe("");
    await input.fill("My Project");
    expect(await input.inputValue()).toBe("My Project");
  });

  it("branch input defaults to tickets and is editable", async () => {
    await gotoAddProject();
    await waitVisible(ctx.page, "add-project-branch-input");
    const input = testId(ctx.page, "add-project-branch-input");
    expect(await input.inputValue()).toBe("tickets");
    await input.fill("work-items");
    expect(await input.inputValue()).toBe("work-items");
  });

  it("path Browse button is rendered", async () => {
    await gotoAddProject();
    await waitVisible(ctx.page, "add-project-path-browse");
    expect(await countOf(ctx.page, "add-project-path-browse")).toBe(1);
  });

  /** The server derives the main branch from the repo, so the field fills itself. */
  async function fillPathAndAwaitMainBranch(repoDir: string): Promise<void> {
    await testId(ctx.page, "add-project-path-input").fill(repoDir);
    await expect.poll(
      () => testId(ctx.page, "add-project-main-branch-input").inputValue(),
      { timeout: 15000 },
    ).not.toBe("");
  }

  it("main branch input is auto-filled after entering a valid path", async () => {
    await gotoAddProject();
    await waitVisible(ctx.page, "add-project-path-input");
    await fillPathAndAwaitMainBranch(scratchRepo());
    expect(await testId(ctx.page, "add-project-main-branch-input").inputValue()).toBe("main");
  });

  it("submit registers the project on disk and creates the orphan branch", async () => {
    const repoDir = scratchRepo();
    await gotoAddProject();
    await waitVisible(ctx.page, "add-project-path-input");

    await fillPathAndAwaitMainBranch(repoDir);
    await testId(ctx.page, "add-project-branch-input").fill("work-items");
    await testId(ctx.page, "add-project-submit").click();

    await waitVisible(ctx.page, "project-header-settings-button");

    const registry = readProjectRegistry(ctx.testServer);
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].branch).toBe("work-items");
    expect(registry.projects[0].mainBranch).toBe("main");
    expect(registry.projects[0].boardId).toEqual(expect.any(String));

    expect(gitBranches(repoDir)).toContain("work-items");
  });
});

describe("Add project with multiple boards (e2e)", () => {
  const ctx = setupE2E();

  it("board select is visible when multiple boards exist", async () => {
    const configDir = path.join(ctx.testServer.dataDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "boards.json"),
      JSON.stringify([
        { id: "kanban", name: "Kanban", columns: [{ name: "To Do" }] },
        { id: "scrum", name: "Scrum", columns: [{ name: "Backlog" }] },
      ]),
    );

    await ctx.page.goto(`${ctx.testServer.baseUrl}/add-project`);
    await waitVisible(ctx.page, "add-project-board-select");
    const options = await testId(ctx.page, "add-project-board-select")
      .locator("option").allTextContents();
    expect(options).toEqual(["Kanban", "Scrum"]);
  });
});
