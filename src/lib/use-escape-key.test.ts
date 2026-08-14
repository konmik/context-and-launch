import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("useEscapeKey development lifecycle", () => {
	it("settles without registering cleanup in a forbidden scope", () => {
		const cacheRoot = path.resolve("node_modules/.cache");
		fs.mkdirSync(cacheRoot, { recursive: true });
		const tempDir = fs.mkdtempSync(path.join(cacheRoot, "escape-key-dev-"));
		const bundlePath = path.join(tempDir, "use-escape-key.mjs");
		const build = spawnSync(process.execPath, [
			path.resolve("node_modules/esbuild/bin/esbuild"),
			path.resolve("src/lib/use-escape-key.ts"),
			"--bundle",
			"--external:solid-js",
			"--format=esm",
			`--outfile=${bundlePath}`,
			"--platform=browser",
		], { encoding: "utf8" });
		expect(build.status, build.stderr).toBe(0);
		const script = `
			globalThis.document = { addEventListener() {}, removeEventListener() {} };
			const { createRoot, flush } = await import("solid-js");
			const { useEscapeKey } = await import(${JSON.stringify(pathToFileURL(bundlePath).href)});
			createRoot(() => useEscapeKey(() => {}));
			flush();
		`;
		let result;
		try {
			result = spawnSync(
				process.execPath,
				[
					"--conditions=browser",
					"--conditions=development",
					"--input-type=module",
					"--eval", script,
				],
				{ cwd: process.cwd(), encoding: "utf8" },
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}

		expect(result.status, result.stderr).toBe(0);
	});
});
