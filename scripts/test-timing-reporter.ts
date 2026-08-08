import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  Reporter, TestCase, TestModule, ReportedHookContext,
} from "vitest/node";

// Appends one line per test with setup/execution/cleanup phase timings.
// Under the official RAM-disk runner the log lands in the run's temp dir on T:
// (T:\context-launch-tests\<project>\<branch>\temp\test-timing.log).
// Override the location with TEST_TIMING_LOG.
const LOG_PATH = process.env.TEST_TIMING_LOG ?? path.join(os.tmpdir(), "test-timing.log");

interface PerTestHooks { beforeEachMs: number; afterEachMs: number; }
interface PerFileHooks { beforeAllMs: number; afterAllMs: number; }

// Hooks of one entity can be in flight while another entity's hooks run: tests
// within a file run concurrently under maxConcurrency, and files run in parallel
// workers whose events interleave in this single reporter instance. Keying a
// start time by entity and hook name pairs it with its own end under any
// interleaving, and an entity whose hook throws never reports an end, so its
// stale start is simply never read.
function startKey(hook: ReportedHookContext): string {
  return `${hook.entity.id}:${hook.name}`;
}

export default class TestTimingReporter implements Reporter {
  private perTest = new Map<string, Map<string, PerTestHooks>>();
  private perFile = new Map<string, PerFileHooks>();
  private startedAt = new Map<string, number>();

  onHookStart(hook: ReportedHookContext): void {
    this.startedAt.set(startKey(hook), Date.now());
  }

  onHookEnd(hook: ReportedHookContext): void {
    const t0 = this.startedAt.get(startKey(hook));
    if (t0 === undefined) return;
    this.startedAt.delete(startKey(hook));
    const delta = Date.now() - t0;

    if (hook.name === "beforeEach" || hook.name === "afterEach") {
      const test: TestCase = hook.entity;
      const moduleId = test.module.moduleId;
      const fileTests = this.perTest.get(moduleId) ?? new Map<string, PerTestHooks>();
      const times = fileTests.get(test.name) ?? { beforeEachMs: 0, afterEachMs: 0 };
      if (hook.name === "beforeEach") times.beforeEachMs += delta;
      else times.afterEachMs += delta;
      fileTests.set(test.name, times);
      this.perTest.set(moduleId, fileTests);
      return;
    }

    const moduleId = hook.entity.type === "module"
      ? hook.entity.moduleId
      : hook.entity.module.moduleId;
    const times = this.perFile.get(moduleId) ?? { beforeAllMs: 0, afterAllMs: 0 };
    if (hook.name === "beforeAll") times.beforeAllMs += delta;
    else times.afterAllMs += delta;
    this.perFile.set(moduleId, times);
  }

  onTestRunEnd(modules: readonly TestModule[]): void {
    const lines: string[] = [];
    for (const module of modules) {
      const testHooks = this.perTest.get(module.moduleId);
      const fileHooks = this.perFile.get(module.moduleId);
      for (const test of module.children.allTests()) {
        const result = test.result();
        if (!result || result.state === "skipped") continue;
        const hooks = testHooks?.get(test.name) ?? { beforeEachMs: 0, afterEachMs: 0 };
        const total = Math.round(test.diagnostic()?.duration ?? 0);
        // The runner times the test in its worker while the hook events above are
        // stamped here in the main process, so the two clocks disagree slightly
        // and the remainder can fall below zero under load.
        const exec = Math.max(0, total - hooks.beforeEachMs - hooks.afterEachMs);
        lines.push(
          `test ${JSON.stringify(module.moduleId)} ${JSON.stringify(test.name)}`
          + ` setup=${hooks.beforeEachMs}ms exec=${exec}ms`
          + ` cleanup=${hooks.afterEachMs}ms total=${total}ms`,
        );
      }
      if (fileHooks && (fileHooks.beforeAllMs > 0 || fileHooks.afterAllMs > 0)) {
        lines.push(
          `file ${JSON.stringify(module.moduleId)}`
          + ` beforeAll=${fileHooks.beforeAllMs}ms afterAll=${fileHooks.afterAllMs}ms`,
        );
      }
    }
    if (lines.length === 0) return;
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(
      LOG_PATH,
      `=== ${new Date().toISOString()} ===\n${lines.join("\n")}\n`,
      "utf8",
    );
  }
}
