import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// The built entry exports a request handler and binds no port, so only
// scripts/serve.mjs can turn it into a listening server. A launch script that
// spawns the built entry directly leaves nothing listening.
const launchScripts = ["run.sh", "run.ps1"];

describe("launch scripts", () => {
  for (const name of launchScripts) {
    it(`${name} starts the server through scripts/serve.mjs`, () => {
      const contents = fs.readFileSync(path.join(repoRoot, name), "utf8");
      // A start command spans several lines through a continuation, so the
      // statements are read back as whole commands before they are matched.
      const startLines = contents
        .replace(/[`\\]\r?\n\s*/g, " ")
        .split("\n")
        .filter((line) => /\bnode\b/.test(line) && /\.output|serve\.mjs/.test(line));
      expect(startLines.join("\n")).toMatch(/scripts[/\\]serve\.mjs/);
      expect(startLines.join("\n")).not.toMatch(/\.output/);
    });

		it(`${name} distinguishes missing, stale, and current build output`, () => {
			const contents = fs.readFileSync(path.join(repoRoot, name), "utf8");
			expect(contents).toContain("BUILD=yes REASON=");
			expect(contents).toContain("BUILD=no");
			expect(contents).toMatch(/missing/);
			expect(contents).toMatch(/stale/);
		});
  }
});
