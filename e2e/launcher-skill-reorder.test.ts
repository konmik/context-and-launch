import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { type Browser, type Page } from "playwright";
import {
  createServer, launchBrowser, createProject, uniqueSlug, gotoProject, openTicketDetail,
  dragSortable,
  type TestServer, type TestBrowser, type CreatedProject,
  readProjectLauncherConfig, poll,
} from "./fixtures.js";

let testServer: TestServer;
let testBrowser: TestBrowser;
let browser: Browser;
let page: Page;

const TICKET = { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" };

async function skillNames(p: Page): Promise<string[]> {
  return p.locator('[data-testid="launcher-skill-row"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-skill-name") ?? ""));
}

async function dragSkill(p: Page, fromName: string, toName: string) {
  await dragSortable(
    p,
    `[data-testid="launcher-skill-row"][data-skill-name="${fromName}"] [data-testid="launcher-skill-drag-handle"]`,
    `[data-testid="launcher-skill-row"][data-skill-name="${toName}"]`,
  );
}

async function openLauncher(p: Page) {
  await openTicketDetail(p, "t-1-alpha");
  await p.click('[data-testid="ticket-detail-tab-launcher"]');
  await p.waitForSelector('[data-testid="launcher-skill-row"]', { timeout: 15000 });
}

describe("Agent launcher skill reorder (e2e, real server)", () => {
  let project: CreatedProject;

  beforeAll(async () => {
    testServer = await createServer();
    testBrowser = await launchBrowser();
    browser = testBrowser.browser;
  }, 60000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    project = await createProject(testServer, {
      projectSlug: uniqueSlug("skill-reorder"),
      withTickets: [TICKET],
      appLauncherConfig: {
        templates: [{ name: "Default", text: "do it" }],
        profiles: [{ name: "Claude", command: "echo" }],
        skills: [
          { name: "alpha-skill", text: "a" },
          { name: "bravo-skill", text: "b" },
          { name: "charlie-skill", text: "c" },
        ],
      },
    });
    await gotoProject(page, testServer, project.projectSlug);
  });

  afterEach(async () => {
    await page?.close();
    project?.cleanup();
  });

  afterAll(async () => {
    await testBrowser?.stop();
    await testServer?.stop();
  }, 20000);

  it("renders skills in merged config order by default", async () => {
    await openLauncher(page);
    expect(await skillNames(page)).toEqual(["alpha-skill", "bravo-skill", "charlie-skill"]);
  }, 60000);

  it("drag reorders skills and persists to project-level column defaults", async () => {
    await openLauncher(page);
    await dragSkill(page, "alpha-skill", "charlie-skill");
    const cfg = await poll(
      () => readProjectLauncherConfig(testServer, project.projectSlug),
      (c) => {
        const order = c?.columnDefaults?.["todo"]?.skillOrder;
        return !!order && order.includes("alpha-skill") && order[0] !== "alpha-skill";
      },
      5000,
    );
    const after = await skillNames(page);
    expect(after).toContain("alpha-skill");
    expect(after[0]).not.toBe("alpha-skill");
    expect(cfg?.columnDefaults?.["todo"]?.skillOrder).toEqual(after);
  }, 60000);
});
