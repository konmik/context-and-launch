import { describe, it, expect } from "vitest";
import { type Locator, type Page } from "playwright";
import {
  openProject, openTicketDetail, dragElement,
  type CreatedProject,
  readProjectLauncherConfig, poll,
  setupE2E,
} from "./fixtures.js";
import { testId, waitVisible } from "./locators.js";

const TICKET = { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" };

async function skillNames(p: Page): Promise<string[]> {
  return testId(p, "launcher-skill-row").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-skill-name") ?? ""));
}

function skillRow(p: Page, name: string): Locator {
  return testId(p, "launcher-skill-row", { "data-skill-name": name });
}

async function dragSkill(p: Page, fromName: string, toName: string) {
  await dragElement(
    p,
    testId(skillRow(p, fromName), "launcher-skill-drag-handle"),
    skillRow(p, toName),
  );
}

async function openLauncher(p: Page) {
  await openTicketDetail(p, "t-1-alpha");
  await testId(p, "ticket-detail-tab-launcher").click();
  await waitVisible(p, "launcher-skill-row");
}

describe("Agent launcher skill reorder (e2e, real server)", () => {
  const ctx = setupE2E({ viewport: { width: 1200, height: 900 } });

  async function setup(suffix: string): Promise<CreatedProject> {
    const project = await openProject(ctx, {
      slugBase: `skill-reorder-${suffix}`,
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
    await openLauncher(ctx.page);
    return project;
  }

  it("renders skills in merged config order by default", async () => {
    await setup("default-order");
    expect(await skillNames(ctx.page)).toEqual(["alpha-skill", "bravo-skill", "charlie-skill"]);
  });

  it("drag reorders skills and persists to project-level column defaults", async () => {
    const project = await setup("drag");
    await dragSkill(ctx.page, "alpha-skill", "charlie-skill");
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => {
        const order = c?.columnDefaults?.["todo"]?.skillOrder;
        return !!order && order.includes("alpha-skill") && order[0] !== "alpha-skill";
      },
      5000,
    );
    const after = await skillNames(ctx.page);
    expect(after).toContain("alpha-skill");
    expect(after[0]).not.toBe("alpha-skill");
    expect(cfg?.columnDefaults?.["todo"]?.skillOrder).toEqual(after);
  });
});
