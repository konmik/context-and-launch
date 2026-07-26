import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  ticketContextFile, readContextFile, poll,
  setupE2E,
} from "./fixtures.js";
import { setupEditorTicket } from "./ticket-detail-editor-shared.js";

describe("Ticket detail external worktree changes (e2e, real server)", () => {
  const ctx = setupE2E();

  async function editorText(): Promise<string> {
    return (await ctx.page.locator(".cm-content").innerText()).trim();
  }

  it("an agent's write to the open file refreshes the editor", async () => {
    const project = await setupEditorTicket(ctx, "ext-refresh");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    expect(await editorText()).toBe("original");

    fs.writeFileSync(
      ticketContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do"),
      "written by the agent",
    );

    await ctx.page.waitForFunction(
      () => document.querySelector(".cm-content")?.textContent?.includes("written by the agent"),
      undefined,
      { timeout: 15000 },
    );
  }, 60000);

  it("an agent's write during editing is held as a conflict instead of being overwritten", async () => {
    const project = await setupEditorTicket(ctx, "ext-conflict");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("mine ");
    await ctx.page.waitForTimeout(200);

    const contextFile = ticketContextFile(
      ctx.testServer, project.projectSlug, "t-1-alpha", "to-do",
    );
    fs.writeFileSync(contextFile, "written by the agent");

    await ctx.page.waitForTimeout(4000);
    expect(await editorText()).toContain("mine");
    expect(await editorText()).toContain("original");

    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-external-change-overwrite"]', {
      state: "visible", timeout: 15000,
    });
    expect(readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do"))
      .toBe("written by the agent");

    await ctx.page.click('[data-testid="ticket-detail-external-change-discard"]');
    await ctx.page.waitForFunction(
      () => {
        const text = document.querySelector(".cm-content")?.textContent ?? "";
        return text.includes("written by the agent") && !text.includes("mine");
      },
      undefined,
      { timeout: 15000 },
    );
  }, 60000);

  it("overwrite keeps the edited version and writes it to disk", async () => {
    const project = await setupEditorTicket(ctx, "ext-overwrite");
    const editor = ctx.page.locator(".cm-content");
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await ctx.page.keyboard.type("mine ");
    await ctx.page.waitForTimeout(200);

    fs.writeFileSync(
      ticketContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do"),
      "written by the agent",
    );
    await ctx.page.waitForTimeout(4000);

    await ctx.page.click('[data-testid="ticket-detail-save-button"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-external-change-overwrite"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-external-change-overwrite"]');

    const content = await poll(
      () => readContextFile(ctx.testServer, project.projectSlug, "t-1-alpha", "to-do"),
      (c) => c?.includes("mine") ?? false,
      10000,
    );
    expect(content?.includes("mine")).toBe(true);
  }, 60000);
});
