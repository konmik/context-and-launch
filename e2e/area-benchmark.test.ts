import { describe, it, expect } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import {
  createServer, createProject, uniqueSlug,
  type TestServer, type CreatedProject, type SeedTicket,
} from "./fixtures.js";

// Ranks the slowest user-facing areas against a real server + real browser and
// decomposes board load (server SSR vs client hydration/paint). Re-run after a
// change to compare: `npx vitest run --project e2e e2e/area-benchmark.test.ts`.

const COLUMNS = ["todo", "in-progress", "review", "blocked", "qa", "done"];
const TICKET_COUNT = Number(process.env.BENCH_TICKETS ?? 300);
const RUNS = Number(process.env.BENCH_RUNS ?? 5);

function seedTickets(count: number): SeedTicket[] {
  const tickets: SeedTicket[] = [];
  for (let i = 0; i < count; i++) {
    const number = `B-${i + 1}`;
    const folderName = `b-${i + 1}-benchmark-ticket-${i + 1}`;
    const dependsOn = i % 5 === 0 && i > 0 ? [`B-${i}`] : undefined;
    const memberOf = i % 11 === 0 && i > 0 ? `B-${i - (i % 11)}` : undefined;
    tickets.push({
      number,
      title: `Benchmark ticket number ${i + 1} with a reasonably long title`,
      status: COLUMNS[i % COLUMNS.length],
      folderName,
      dependsOn,
      memberOf,
      body: `# Benchmark ticket ${i + 1}\n\n`
        + `This is a body paragraph for ticket ${i + 1}. `.repeat(8)
        + `\n\n- item one\n- item two\n- item three\n`,
    });
  }
  return tickets;
}

interface Stat { label: string; median: number; min: number; max: number; fails: number; }

function summarize(label: string, samples: number[], fails: number): Stat {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : Infinity;
  return {
    label, median, min: sorted[0] ?? Infinity, max: sorted[sorted.length - 1] ?? Infinity, fails,
  };
}

describe("Area benchmark (real server + real browser)", () => {
  it("measures and ranks the slowest user-facing areas", async () => {
    const server: TestServer = await createServer({ dataDirPrefix: "cl-areabench-" });
    const browser: Browser = await chromium.launch({ headless: true });
    let project: CreatedProject | undefined;
    const stats: Stat[] = [];

    async function measure(
      label: string,
      body: (page: Page) => Promise<void>,
      setup?: (page: Page) => Promise<void>,
    ): Promise<void> {
      const samples: number[] = [];
      let fails = 0;
      for (let r = 0; r < RUNS; r++) {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        try {
          if (setup) await setup(page);
          const start = performance.now();
          await body(page);
          samples.push(performance.now() - start);
        } catch (err) {
          fails++;
          console.warn(`[area-benchmark] "${label}" run ${r} failed: ${String(err)}`);
        } finally {
          await page.context().close();
        }
      }
      stats.push(summarize(label, samples, fails));
    }

    const base = server.baseUrl;
    let slug = "";

    async function gotoBoard(page: Page): Promise<void> {
      await page.goto(`${base}/project/${slug}`);
      await page.waitForSelector('[data-testid="kanban-board-column-header"]', {
        state: "visible", timeout: 30000,
      });
      await page.waitForFunction(
        (n) => document.querySelectorAll('[data-testid="kanban-board-ticket-card"]').length >= n,
        TICKET_COUNT,
        { timeout: 30000 },
      );
    }

    try {
      project = await createProject(server, {
        projectSlug: uniqueSlug("area-bench"),
        withRemote: true,
        withBoards: [{ id: "kanban", name: "Kanban", columns: COLUMNS.map((name) => ({ name })) }],
        withTickets: seedTickets(TICKET_COUNT),
      });
      slug = project.projectSlug;

      // Area 1: full board load (cold navigation, all cards rendered).
      await measure("board-load", async (page) => { await gotoBoard(page); });

      // Board-load decomposition: time-to-first-column-header vs time-to-all-cards.
      {
        const headerSamples: number[] = [];
        const cardSamples: number[] = [];
        for (let r = 0; r < RUNS; r++) {
          const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
          try {
            const start = performance.now();
            await page.goto(`${base}/project/${slug}`);
            await page.waitForSelector('[data-testid="kanban-board-column-header"]', {
              state: "visible", timeout: 30000,
            });
            headerSamples.push(performance.now() - start);
            await page.waitForFunction(
              (n) => document.querySelectorAll('[data-testid="kanban-board-ticket-card"]').length >= n,
              TICKET_COUNT,
              { timeout: 30000 },
            );
            cardSamples.push(performance.now() - start);
          } finally {
            await page.context().close();
          }
        }
        const h = summarize("first-header", headerSamples, 0);
        const c = summarize("all-cards", cardSamples, 0);
        console.log(
          `[area-benchmark] board-load split | first-header ${h.median.toFixed(0)} ms `
          + `| all-cards ${c.median.toFixed(0)} ms | client-render delta ~${(c.median - h.median).toFixed(0)} ms`,
        );
      }

      // Area 2: ticket detail dialog open.
      await measure("ticket-detail-open", async (page) => {
        await page.locator('[data-testid="kanban-board-ticket-card"]').first().click();
        await page.waitForSelector('[data-testid="ticket-detail-number-input"]', {
          state: "visible", timeout: 20000,
        });
      }, gotoBoard);

      // Area 3: Forest View first render.
      await measure("forest-view-render", async (page) => {
        await page.click('[data-testid="project-header-forest-toggle-button"]');
        await page.waitForSelector('[data-testid="forest-surface"]', {
          state: "visible", timeout: 30000,
        });
        await page.waitForFunction(
          () => document.querySelectorAll('[data-testid="forest-ticket-card"]').length > 0,
          undefined, { timeout: 30000 },
        );
      }, gotoBoard);

      // Area 4: Settings (Launcher Config) dialog open.
      await measure("settings-open", async (page) => {
        await page.click('[data-testid="project-header-settings-button"]');
        await page.waitForSelector('[data-testid="launcher-settings-tab-misc"]', {
          state: "visible", timeout: 20000,
        });
      }, gotoBoard);

      // Area 5: Create-ticket dialog open.
      await measure("create-ticket-open", async (page) => {
        await page.click('[data-testid="project-header-new-ticket-button"]');
        await page.waitForSelector('[data-testid="create-ticket-number-input"]', {
          state: "visible", timeout: 20000,
        });
      }, gotoBoard);

      // Area 6: Palette switch (client restyle of the whole board).
      await measure("palette-switch", async (page) => {
        await page.click('[data-testid="palette-picker-trigger"]');
        await page.click('[data-testid="palette-picker-item-dracula"]');
        await page.waitForTimeout(50);
      }, gotoBoard);

      // Area 7: Sync pending check.
      await measure("sync-pending-check", async (page) => {
        await page.waitForSelector(
          '[data-testid="sync-button-check-icon"], [data-testid="sync-button-pending-badge"]',
          { state: "visible", timeout: 20000 },
        );
      }, gotoBoard);

      stats.sort((a, b) => b.median - a.median);
      const lines = stats.map((s, i) =>
        `  ${i + 1}. ${s.label.padEnd(22)} median ${s.median.toFixed(0).padStart(6)} ms`
        + `  (min ${s.min.toFixed(0)}, max ${s.max.toFixed(0)}${s.fails ? `, fails ${s.fails}` : ""})`,
      );
      console.log(
        `\n[area-benchmark] ${TICKET_COUNT} tickets, ${COLUMNS.length} columns, ${RUNS} runs each\n`
        + `Slowest areas (ranked by median):\n${lines.join("\n")}\n`,
      );

      for (const s of stats) {
        expect(s.fails, `${s.label} had ${s.fails} failed runs`).toBe(0);
        expect(s.median, `${s.label} median regressed badly`).toBeLessThan(30000);
      }
    } finally {
      await browser.close();
      project?.cleanup();
      await server.stop();
    }
  }, 600000);
});
