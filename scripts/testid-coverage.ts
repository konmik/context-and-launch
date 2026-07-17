import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".output" || e.name === ".vinxi") continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

const LITERAL_RE = /data-testid="([a-z0-9-]+)"/g;

function scanLiterals(file: string): Set<string> {
  const text = fs.readFileSync(file, "utf-8");
  const found = new Set<string>();
  for (const m of text.matchAll(LITERAL_RE)) found.add(m[1]);
  return found;
}

function scanReferences(file: string): Set<string> {
  const text = fs.readFileSync(file, "utf-8");
  const found = new Set<string>();
  const patterns: RegExp[] = [
    /data-testid=\\?["']([a-z0-9-]+)\\?["']/g,
    /testId:\s*["']([a-z0-9-]+)["']/g,
    /triggerTestId:\s*["']([a-z0-9-]+)["']/g,
    /testIdOverride:\s*["']([a-z0-9-]+)["']/g,
    /addButtonTestId:\s*["']([a-z0-9-]+)["']/g,
    /editTestId:\s*["']([a-z0-9-]+)["']/g,
    /deleteTestId:\s*["']([a-z0-9-]+)["']/g,
    /cancelTestId:\s*["']([a-z0-9-]+)["']/g,
    /submitTestId:\s*["']([a-z0-9-]+)["']/g,
    /nameInputTestId:\s*["']([a-z0-9-]+)["']/g,
    /textInputTestId:\s*["']([a-z0-9-]+)["']/g,
    /scopeAppTestId:\s*["']([a-z0-9-]+)["']/g,
    /scopeProjectTestId:\s*["']([a-z0-9-]+)["']/g,
    /dragHandleTestId:\s*["']([a-z0-9-]+)["']/g,
    /rowTestId:\s*["']([a-z0-9-]+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.add(m[1]);
  }
  return found;
}

const srcFiles = walk(
  path.join(REPO, "src"),
  (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx") && !p.endsWith(".render.test.tsx"),
);

const e2eFiles = walk(
  path.join(REPO, "e2e"),
  (p) => p.endsWith(".ts"),
);

const required = new Set<string>();
for (const f of srcFiles) {
  for (const id of scanLiterals(f)) required.add(id);
}

for (const f of srcFiles) {
  for (const id of scanReferences(f)) required.add(id);
}

const referenced = new Set<string>();
for (const f of e2eFiles) {
  for (const id of scanReferences(f)) referenced.add(id);
}

const missing = [...required].filter((id) => !referenced.has(id)).sort();

if (missing.length > 0) {
  console.error("Coverage gate failed: src data-testid values with no e2e reference:");
  for (const id of missing) console.error("  -", id);
  console.error("\nAdd a test that references the testid, or remove it from src.");
  process.exit(1);
}

console.log(`Coverage gate passed: ${required.size} testids, all referenced.`);
