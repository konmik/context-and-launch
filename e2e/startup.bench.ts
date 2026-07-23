import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";
import { createProject, uniqueSlug, type CreatedProject } from "./fixtures.js";
import { rmTemp } from "./real-server.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_COUNT = 3;
const TICKETS_PER_PROJECT = 20;
const STATUSES = ["todo", "in-progress", "done"];

interface LaunchTimings {
  windowMs: number;
  allBoardsMs: number;
}

async function launchAppAndMeasure(
  env: NodeJS.ProcessEnv,
  projects: CreatedProject[],
): Promise<LaunchTimings> {
  const start = performance.now();
  const app = await _electron.launch({
    args: [path.join(PROJECT_ROOT, "electron", "main.js")],
    cwd: PROJECT_ROOT,
    env: env as { [key: string]: string },
  });
  let stderr = "";
  app.process().stderr?.on("data", (b: Buffer) => { stderr += b.toString(); });
  try {
    const firstPage = await app.firstWindow();
    const windowMs = performance.now() - start;

    const pagesDeadline = performance.now() + 30000;
    const trackedPages = () => {
      const set = new Set([firstPage, ...app.windows(), ...app.context().pages()]);
      return [...set];
    };
    while (trackedPages().length < projects.length) {
      if (performance.now() > pagesDeadline) {
        const urls = trackedPages().map((w) => w.url()).join(", ");
        throw new Error(
          `waited for ${projects.length} windows, got ${trackedPages().length} [${urls}]\n`
          + `main process stderr:\n${stderr}`,
        );
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const pages = trackedPages();
    await Promise.all(pages.map((page) =>
      page.waitForSelector(
        '[data-testid="kanban-board-ticket-card"]',
        { state: "visible", timeout: 60000 },
      ),
    ));
    const allBoardsMs = performance.now() - start;
    return { windowMs, allBoardsMs };
  } finally {
    await app.close();
  }
}

describe("Startup benchmark (real Electron app)", () => {
  it("reports launch-to-window and launch-to-boards timings", async () => {
    execSync("npm run electron:build-main", { cwd: PROJECT_ROOT, stdio: "ignore" });

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-bench-app-data-"));
    const reposParentDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-bench-app-repos-"));
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-bench-app-appdata-"));
    fs.mkdirSync(path.join(dataDir, "config"), { recursive: true });
    for (const file of fs.readdirSync(path.join(PROJECT_ROOT, "config-defaults"))) {
      fs.copyFileSync(
        path.join(PROJECT_ROOT, "config-defaults", file),
        path.join(dataDir, "config", file),
      );
    }

    try {
      const projects: CreatedProject[] = [];
      for (let p = 0; p < PROJECT_COUNT; p++) {
        projects.push(await createProject({ dataDir, reposParentDir }, {
          projectSlug: uniqueSlug(`bench-app-${p}`),
          withRemote: true,
          withBoards: [{
            id: "kanban", name: "Kanban",
            columns: [{ name: "todo" }, { name: "in-progress" }, { name: "done" }],
          }],
          withTickets: Array.from({ length: TICKETS_PER_PROJECT }, (_, i) => ({
            number: `B-${i + 1}`,
            title: `Benchmark ticket ${i + 1}`,
            folderName: `b-${i + 1}-benchmark-ticket-${i + 1}`,
            status: STATUSES[i % STATUSES.length],
            body: `# Benchmark ticket ${i + 1}\n\nSome body text for ticket ${i + 1}.\n`,
          })),
        }));
      }

      const userDataDir = path.join(appDataDir, "user-data");
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(
        path.join(userDataDir, "window-state.json"),
        JSON.stringify({
          windows: projects.map((project, i) => ({
            projectSlug: project.projectSlug,
            bounds: { x: 40 * i, y: 40 * i, width: 1280, height: 800 },
            maximized: false,
          })),
        }),
      );

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CONTEXT_LAUNCH_USER_DATA_DIR: userDataDir,
        CONTEXT_LAUNCH_DATA_DIR: dataDir,
        CONTEXT_PICKER_STUB: "__cancel__",
        CONTEXT_FILE_PICKER_STUB: "__cancel__",
        CONTEXT_OPEN_IN_OS_STUB: "__noop__",
      };

      const first = await launchAppAndMeasure(env, projects);
      const second = await launchAppAndMeasure(env, projects);

      console.log(
        `[startup-benchmark] ${PROJECT_COUNT} windows, ${TICKETS_PER_PROJECT} tickets each | `
        + `first launch: window ${first.windowMs.toFixed(0)} ms, `
        + `all boards ${first.allBoardsMs.toFixed(0)} ms | `
        + `second launch: window ${second.windowMs.toFixed(0)} ms, `
        + `all boards ${second.allBoardsMs.toFixed(0)} ms`,
      );

      expect(first.allBoardsMs).toBeLessThan(60000);
      expect(second.allBoardsMs).toBeLessThan(60000);
    } finally {
      await rmTemp(dataDir, "startup bench dataDir");
      await rmTemp(reposParentDir, "startup bench reposParentDir");
      await rmTemp(appDataDir, "startup bench appDataDir");
    }
  }, 300000);
});
