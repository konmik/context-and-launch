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
interface HookEntry {
  name: ReportedHookContext["name"];
  entity: ReportedHookContext["entity"];
  t0: number;
}

function moduleIdOf(entity: ReportedHookContext["entity"]): string | null {
  if (entity.type === "module") return (entity as TestModule).moduleId;
  const module = (entity as TestCase).module;
  return module?.moduleId ?? null;
}

export default class TestTimingReporter implements Reporter {
  private perTest = new Map<string, Map<string, PerTestHooks>>();
  private perFile = new Map<string, PerFileHooks>();
  // Files run in parallel workers whose hook events interleave in this single
  // reporter instance, so start/end pairing is tracked per module; hooks
  // within one module run strictly sequentially.
  private stacks = new Map<string, HookEntry[]>();

  onHookStart(hook: ReportedHookContext): void {
    const moduleId = moduleIdOf(hook.entity);
    if (!moduleId) return;
    const stack = this.stacks.get(moduleId) ?? [];
    stack.push({ name: hook.name, entity: hook.entity, t0: Date.now() });
    this.stacks.set(moduleId, stack);
  }

  onHookEnd(hook: ReportedHookContext): void {
    const moduleId = moduleIdOf(hook.entity);
    if (!moduleId) return;
    const entry = this.stacks.get(moduleId)?.pop();
    if (!entry || entry.name !== hook.name) return;
    const delta = Date.now() - entry.t0;
    if (hook.name === "beforeEach" || hook.name === "afterEach") {
      const testName = (hook.entity as TestCase).name;
      const fileTests = this.perTest.get(moduleId) ?? new Map<string, PerTestHooks>();
      const times = fileTests.get(testName) ?? { beforeEachMs: 0, afterEachMs: 0 };
      if (hook.name === "beforeEach") times.beforeEachMs += delta;
      else times.afterEachMs += delta;
      fileTests.set(testName, times);
      this.perTest.set(moduleId, fileTests);
    } else {
      const times = this.perFile.get(moduleId) ?? { beforeAllMs: 0, afterAllMs: 0 };
      if (hook.name === "beforeAll") times.beforeAllMs += delta;
      else times.afterAllMs += delta;
      this.perFile.set(moduleId, times);
    }
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
        const setup = Math.round(hooks.beforeEachMs);
        const cleanup = Math.round(hooks.afterEachMs);
        // Execution is total minus the hook attribution; where the runner's
        // duration excludes hook overhead the difference clamps at 0.
        const exec = Math.max(0, total - setup - cleanup);
        lines.push(
          `test ${JSON.stringify(module.moduleId)} ${JSON.stringify(test.name)}`
          + ` setup=${setup}ms exec=${exec}ms cleanup=${cleanup}ms total=${total}ms`,
        );
      }
      if (fileHooks && (fileHooks.beforeAllMs > 0 || fileHooks.afterAllMs > 0)) {
        lines.push(
          `file ${JSON.stringify(module.moduleId)}`
          + ` beforeAll=${Math.round(fileHooks.beforeAllMs)}ms afterAll=${Math.round(fileHooks.afterAllMs)}ms`,
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
