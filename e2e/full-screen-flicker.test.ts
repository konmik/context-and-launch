import { describe, it, expect } from "vitest";
import type { Page } from "playwright";
import {
  createProject, uniqueSlug, gotoProject, setupE2E,
} from "./fixtures.js";

// Counts detachments of the full app UI. A Suspense collapse to the root
// boundary removes the subtree containing <header> from the DOM, which is the
// full-screen flicker as a DOM fact, independent of frame timing.
const DETACH_COUNTER = `
window.__fullUiDetachCount = 0;
window.__observerActive = false;
(() => {
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        const el = n;
        if (el.tagName === "HEADER" || (el.querySelector && el.querySelector("header"))) {
          window.__fullUiDetachCount++;
        }
      }
    }
  });
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__observerActive = true;
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
`;

interface DetachProbe {
  __fullUiDetachCount: number;
  __observerActive: boolean;
}

function detachCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as DetachProbe).__fullUiDetachCount);
}

function observerActive(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as DetachProbe).__observerActive);
}

function trackServerResponses(page: Page): string[] {
  const responses: string[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/_server")) responses.push(res.url());
  });
  return responses;
}

describe("Full-screen flicker (e2e, real server)", () => {
  const ctx = setupE2E();

  it("keeps the UI attached while deferred background reads load after start", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("flicker-start"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await ctx.page.addInitScript(DETACH_COUNTER);
    const responses = trackServerResponses(ctx.page);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await expect.poll(
      () => responses.filter((u) => u.includes("getSyncStatus") || u.includes("getHerdrAgentStatuses")).length,
      { timeout: 15000 },
    ).toBeGreaterThanOrEqual(2);
    expect(await observerActive(ctx.page)).toBe(true);
    expect(await detachCount(ctx.page)).toBe(0);
  }, 60000);

  it("keeps the UI attached when opening a ticket", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("flicker-open-ticket"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await ctx.page.addInitScript(DETACH_COUNTER);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.evaluate(() => {
      (window as unknown as { __fullUiDetachCount: number }).__fullUiDetachCount = 0;
    });
    await ctx.page.click('[data-testid="kanban-board-ticket-card"][data-folder-name="t-1-alpha"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "visible",
      timeout: 15000,
    });
    expect(await observerActive(ctx.page)).toBe(true);
    expect(await detachCount(ctx.page)).toBe(0);
  }, 60000);
});
