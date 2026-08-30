import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createProject, type CreatedProject } from "./fixtures.js";
import { pickPort } from "./test-port.js";
import { removeTempDirOrWarn } from "../src/test-temp.js";

describe("Project window (e2e, Vite development server)", () => {
  let browser: Browser;
  let page: Page;
  let vite: ChildProcess;
  let project: CreatedProject;
  let dataDir: string;
  let reposParentDir: string;
  let baseUrl: string;
  const diagnostics: string[] = [];

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-dev-e2e-data-"));
    reposParentDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-dev-e2e-repos-"));
    const port = pickPort();
    baseUrl = `http://127.0.0.1:${port}`;
    project = await createProject(
      { dataDir, reposParentDir },
      { projectSlug: "dev-startup", withTickets: [
        { number: "DEV-1", title: "Startup", status: "todo" },
      ] },
    );

    vite = spawn(
      process.execPath,
      [
        path.resolve("node_modules/vite/bin/vite.js"),
        "--host", "127.0.0.1",
        "--port", String(port),
        "--strictPort",
      ],
      {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          NODE_ENV: "development",
          CONTEXT_LAUNCH_DATA_DIR: dataDir,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    vite.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const deadline = Date.now() + 20_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (vite.exitCode !== null) throw new Error(`Vite exited early:\n${stderr}`);
      try {
        const response = await fetch(baseUrl);
        if (response.status < 500) {
          ready = true;
          break;
        }
      } catch {
        // Vite has not bound its port yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Vite did not become ready:\n${stderr}`);

    browser = await chromium.launch({ headless: true, channel: "chrome" });
    page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        diagnostics.push(message.text());
      }
    });
    page.on("pageerror", (error) => diagnostics.push(error.message));

    // The Project route pulls in lazily imported chunks that Vite has not seen
    // yet. Meeting them the first time makes it re-optimize its dependencies and
    // force a full reload, which detaches whatever a test was reaching for. Walk
    // the route once here so that reload lands in setup instead of mid-test.
    await page.goto(`${baseUrl}/project/${project.projectSlug}`);
    await page.locator('[data-testid="kanban-board-ticket-card"]').first()
      .click({ timeout: 20_000 });
    await page.locator('[data-testid="ticket-detail-tab-editor"]')
      .waitFor({ state: "visible", timeout: 20_000 });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    vite?.kill();
    project?.cleanup();
    await removeTempDirOrWarn(dataDir);
    await removeTempDirOrWarn(reposParentDir);
  });

  it("redirects the Home route without Solid lifecycle diagnostics", async () => {
    diagnostics.length = 0;

    await page.goto(baseUrl);
    await page.locator('[data-testid="kanban-board-scroll"]').waitFor({ state: "visible" });

    expect(diagnostics.filter((message) => message.includes("FLUSH_IN_EFFECT_CALLBACK"))).toEqual([]);
  });

  it("keeps the Kanban board rendered while Ticket Detail is open", async () => {
    diagnostics.length = 0;
    await page.goto(`${baseUrl}/project/${project.projectSlug}`);
    await page.locator('[data-testid="kanban-board-ticket-card"]').first().click();
    await page.locator('[data-testid="ticket-detail-tab-editor"]').waitFor({ state: "visible" });
    await page.waitForTimeout(500);

    expect(diagnostics.filter((message) => message.includes("PRIMITIVE_IN_FORBIDDEN_SCOPE"))).toEqual([]);
    expect(await page.getByRole("alert").allTextContents()).toEqual([]);
    expect(await page.locator('[data-testid="kanban-board-scroll"]').count()).toBe(1);
  });

  it("closes Ticket Detail without delegated event errors after Vite HMR", async () => {
    await page.goto(`${baseUrl}/project/${project.projectSlug}`);
    await page.locator('[data-testid="kanban-board-ticket-card"]').first().click();
    await page.locator('[data-testid="ticket-detail-tab-editor"]').waitFor({ state: "visible" });
    const panelModule = path.resolve("src/components/ui/floating-panel.tsx");
    const hotUpdate = page.waitForEvent("console", {
      predicate: (message) => message.text().includes("hot updated: /src/components/ui/floating-panel.tsx"),
    });
    const panelStat = fs.statSync(panelModule);
    fs.utimesSync(panelModule, panelStat.atime, new Date());
    await hotUpdate;
    await page.waitForTimeout(250);
    diagnostics.length = 0;

    await page.locator('[data-testid="ticket-detail-close-window-button"]').click();
    await page.waitForTimeout(100);

    expect(diagnostics.filter((message) => message.includes("Cannot read properties of undefined (reading '$$")))
      .toEqual([]);
    expect(await page.locator('[data-testid="ticket-detail-close-window-button"]').count()).toBe(0);
  });

  it("runs project workflows without Solid development diagnostics", async () => {
    const expectNoLifecycleDiagnostics = (stage: string) => {
      const lifecycleDiagnostics = diagnostics.filter((message) =>
        message.includes("STRICT_READ_UNTRACKED")
        || message.includes("PRIMITIVE_IN_FORBIDDEN_SCOPE")
        || message.includes("$$pointermove"),
      );
      diagnostics.length = 0;
      expect(lifecycleDiagnostics, stage).toEqual([]);
    };

    await page.goto(baseUrl);
    await page.locator('[data-testid="kanban-board-scroll"], [role="alert"]').first().waitFor({
      state: "visible",
      timeout: 10_000,
    });

    expect(await page.locator("vite-error-overlay").count()).toBe(0);
    expect(await page.getByRole("alert").count()).toBe(0);
    expect(await page.locator('[data-testid="kanban-board-scroll"]').count()).toBe(1);
    expectNoLifecycleDiagnostics("project startup");

    await page.locator('[data-testid="project-header-new-ticket-button"]').click();
    await page.locator('[data-testid="create-ticket-number-input"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="create-ticket-cancel"]').click();
    expectNoLifecycleDiagnostics("New Ticket dialog");

    await page.locator('[data-testid="project-header-settings-button"]').click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.waitFor({ state: "visible" });
    await page.locator('[data-testid="launcher-settings-launch-profile-row"]').first()
      .waitFor({ state: "visible" });
    const dragStrip = settings.locator('[data-scope="floating-panel"][data-part="drag-trigger"]');
    const dragBounds = await dragStrip.boundingBox();
    if (!dragBounds) throw new Error("Settings drag control has no bounds");
    const dragX = dragBounds.x + dragBounds.width / 2;
    const dragY = dragBounds.y + dragBounds.height / 2;
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX + 40, dragY + 40, { steps: 5 });
    await page.mouse.up();
    await page.locator('[data-testid="launcher-settings-close-button"]').click();
    expectNoLifecycleDiagnostics("Settings drag");

    await page.locator('[data-testid="project-header-title-menu-trigger"]').click();
    await page.locator('[data-testid="project-header-launch-agent-menuitem"]').click();
    await page.locator('[data-testid="project-launcher-run-button"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="project-launcher-close-button"]').click();
    expectNoLifecycleDiagnostics("Project Launcher dialog");

    await page.locator('[data-testid="kanban-board-ticket-card"]').first().click();
    await page.locator('[data-testid="ticket-detail-tab-editor"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="ticket-detail-close-window-button"]').click();
    expectNoLifecycleDiagnostics("Ticket Detail dialog");

    await page.locator('[data-testid="project-header-forest-toggle-button"]').click();
    await page.locator('[data-testid="forest-surface"], vite-error-overlay').first().waitFor({
      state: "attached",
      timeout: 10_000,
    });
    expect(await page.locator("vite-error-overlay").count()).toBe(0);
    expect(await page.locator('[data-testid="forest-surface"]').count()).toBe(1);
    const forestBounds = await page.locator('[data-testid="forest-surface"]').boundingBox();
    if (!forestBounds) throw new Error("Forest surface has no bounds");
    await page.mouse.move(forestBounds.x + forestBounds.width / 2, forestBounds.y + forestBounds.height / 2);
    expectNoLifecycleDiagnostics("Forest pointer move");

    await page.locator('[data-testid="forest-ticket-card"]').click();
    const ticketDetailClose = page.locator('[data-testid="ticket-detail-close-button"]');
    await ticketDetailClose.waitFor({ state: "visible" });
    expect(await page.getByRole("alert").count(), "Forest Ticket Detail open app error").toBe(0);
    await page.waitForTimeout(500);
    await ticketDetailClose.hover();
    expect(await page.getByRole("alert").count(), "Forest Ticket Detail app error").toBe(0);
    expectNoLifecycleDiagnostics("Forest Ticket Detail dialog");
  });
});
