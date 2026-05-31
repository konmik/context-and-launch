import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { type Browser, type Page } from "playwright";
import {
  createServer, launchBrowser, createProject, uniqueSlug, gotoProject,
  type TestServer, type TestBrowser, type CreatedProject,
} from "./fixtures.js";

let testServer: TestServer;
let testBrowser: TestBrowser;
let browser: Browser;
let page: Page;

describe("Ripple on Ark UI buttons (e2e, real server)", () => {
  let project: CreatedProject;

  beforeAll(async () => {
    testServer = await createServer();
    testBrowser = await launchBrowser();
    browser = testBrowser.browser;
  }, 60000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    project = await createProject(testServer, {
      projectSlug: uniqueSlug("ripple"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
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

  it("project picker ripple is clipped and anchored to the trigger, not 0,0", async () => {
    const trigger = page.locator('[data-scope="menu"][data-part="trigger"]').first();
    await trigger.waitFor({ state: "visible", timeout: 10000 });
    const box = await trigger.boundingBox();
    if (!box) throw new Error("trigger has no bounding box");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    const result = await trigger.evaluate((el) => {
      const style = getComputedStyle(el);
      const ripple = el.querySelector(".ripple-effect") as HTMLElement | null;
      const elRect = el.getBoundingClientRect();
      const rippleRect = ripple?.getBoundingClientRect() ?? null;
      return {
        position: style.position,
        overflow: style.overflow,
        hasRipple: !!ripple,
        elTop: elRect.top,
        rippleTop: rippleRect?.top ?? null,
      };
    });

    await page.mouse.up();

    expect(result.hasRipple).toBe(true);
    expect(result.position).not.toBe("static");
    expect(result.overflow).toBe("hidden");
    expect(result.rippleTop).not.toBeNull();
    expect(Math.abs((result.rippleTop as number) - result.elTop)).toBeLessThan(200);
  }, 60000);
});
