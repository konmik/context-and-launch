import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "valibot";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "temp");
mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "results.json");

console.log("Running unit tests once (single warm fork, no parallelism)...\n");

const run = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "--project",
    "unit-ts",
    "--project",
    "unit-tsx",
    "--no-file-parallelism",
    "--poolOptions.forks.singleFork=true",
    "--reporter=json",
    `--outputFile=${jsonPath}`,
  ],
  { cwd: root, encoding: "utf8", shell: true },
);

if (run.status !== 0) {
  process.stderr.write((run.stdout ?? "") + "\n" + (run.stderr ?? "") + "\n");
}

const FileResultSchema = v.object({
  name: v.string(),
  startTime: v.number(),
  endTime: v.number(),
  status: v.string(),
});
const TestReportSchema = v.object({ testResults: v.array(FileResultSchema) });
const report = v.parse(TestReportSchema, JSON.parse(readFileSync(jsonPath, "utf8")));

const results = report.testResults
  .map((r) => ({
    file: path.relative(root, r.name).replace(/\\/g, "/"),
    ms: r.endTime - r.startTime,
    ok: r.status === "passed",
  }))
  .sort((a, b) => b.ms - a.ms);

const lines = [
  `Test file timings (single warm fork, no parallelism) - ${results.length} files`,
  "",
  ...results.map((r) => `${(r.ms / 1000).toFixed(2).padStart(7)}s  ${r.ok ? "PASS" : "FAIL"}  ${r.file}`),
];
const summary = lines.join("\n");
writeFileSync(path.join(outDir, "timings.txt"), summary + "\n");

console.log(summary);
console.log(`\nSaved to ${path.relative(root, outDir)}/timings.txt`);

if (results.some((r) => !r.ok)) process.exitCode = 1;
