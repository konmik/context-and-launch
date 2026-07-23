import { describe, it, expect } from "vitest";
import {
  createProject, createServer, launchBrowser, uniqueSlug,
} from "./fixtures.js";

describe("Startup benchmark (e2e, real server)", () => {
  it("reports server boot and board render timings", async () => {
    const bootStart = performance.now();
    const testServer = await createServer({ dataDirPrefix: "cl-bench-data-" });
    const serverBootMs = performance.now() - bootStart;

    try {
      const project = await createProject(testServer, {
        projectSlug: uniqueSlug("bench"),
        withBoards: [{
          id: "kanban", name: "Kanban",
          columns: [{ name: "todo" }, { name: "in-progress" }, { name: "done" }],
        }],
        withTickets: [
          { number: "B-1", title: "First", folderName: "b-1-first", status: "todo" },
          { number: "B-2", title: "Second", folderName: "b-2-second", status: "in-progress" },
          { number: "B-3", title: "Third", folderName: "b-3-third", status: "done" },
        ],
      });
      const tb = await launchBrowser();

      try {
        const page = await tb.browser.newPage();
        const url = `${testServer.baseUrl}/project/${project.projectSlug}`;
        const boardReady = () =>
          page.waitForSelector(
            '[data-testid="kanban-board-ticket-card"][data-folder-name="b-1-first"]',
            { state: "visible", timeout: 30000 },
          );

        const coldStart = performance.now();
        await page.goto(url);
        await boardReady();
        const coldLoadMs = performance.now() - coldStart;

        const warmLoadsMs: number[] = [];
        for (let i = 0; i < 3; i++) {
          const warmStart = performance.now();
          await page.reload();
          await boardReady();
          warmLoadsMs.push(performance.now() - warmStart);
        }

        console.log(
          `[startup-benchmark] server boot: ${serverBootMs.toFixed(0)} ms | `
          + `cold board load: ${coldLoadMs.toFixed(0)} ms | `
          + `warm reloads: ${warmLoadsMs.map((m) => m.toFixed(0)).join(" / ")} ms`,
        );

        expect(coldLoadMs).toBeLessThan(30000);
      } finally {
        await tb.stop();
      }
    } finally {
      await testServer.stop();
    }
  }, 120000);
});
