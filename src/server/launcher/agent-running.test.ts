import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// agentRunning resolves the marker path from the app config dir, so mock the
// instances module to point it at a per-test temp dir. The other singletons are
// imported by agent-launch.ts at load time but unused by these tests.
const h = vi.hoisted(() => ({ appDir: "" }));
vi.mock("~/server/config/instances.js", () => ({
	worktreeManager: {},
	projectRegistry: {},
	agentWorktreeManager: {},
	launcherConfigManager: { getAppConfigDir: () => h.appDir },
}));

import { agentRunning, agentMarkerPath } from "~/server/launcher/agent-launch.js";

describe("agentRunning", () => {
	beforeEach(() => {
		h.appDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-running-"));
	});
	afterEach(() => {
		fs.rmSync(h.appDir, { recursive: true, force: true });
	});

	function writeMarker(projectSlug: string, folderName: string, content: string) {
		const p = agentMarkerPath(projectSlug, folderName);
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.writeFileSync(p, content);
		return p;
	}

	it("is false when no marker exists", () => {
		expect(agentRunning("proj", "ticket")).toBe(false);
	});

	it("is true when the marker pid is alive (no start recorded)", () => {
		writeMarker("proj", "ticket", JSON.stringify({ pid: process.pid }));
		expect(agentRunning("proj", "ticket")).toBe(true);
	});

	it("is false and reaps the marker when the pid is dead", () => {
		// A pid near the max is overwhelmingly unlikely to exist.
		const p = writeMarker("proj", "ticket", JSON.stringify({ pid: 2147483646 }));
		expect(agentRunning("proj", "ticket")).toBe(false);
		expect(fs.existsSync(p)).toBe(false);
	});

	it("is false and reaps the marker when a live pid was reused (start mismatch)", () => {
		const stale = JSON.stringify({ pid: process.pid, start: "Thu Jan  1 00:00:00 1970" });
		const p = writeMarker("proj", "ticket", stale);
		expect(agentRunning("proj", "ticket")).toBe(false);
		expect(fs.existsSync(p)).toBe(false);
	});

	it("is false on a malformed marker", () => {
		writeMarker("proj", "ticket", "not json");
		expect(agentRunning("proj", "ticket")).toBe(false);
	});
});
