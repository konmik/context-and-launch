import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fromPartial } from "@total-typescript/shoehorn";
import type { CommandTemplateService } from "../command-template/command-template-service.js";
import { agentMarkerPathIn, isProfileAgentRunning } from "./profile-launch.js";

// The process start-time probe is stubbed with a fixed timestamp so PID-reuse
// detection is deterministic and no real shell runs: any marker whose startSec
// differs from that timestamp describes a different process.
let appDir = "";
const commands = fromPartial<CommandTemplateService>({
	executeSync: () => "2020-01-01T00:00:00.000Z",
});

function agentMarkerPath(projectSlug: string, folderName: string): string {
	return agentMarkerPathIn(appDir, projectSlug, folderName);
}

function agentRunning(projectSlug: string, folderName: string): boolean {
	return isProfileAgentRunning(commands, agentMarkerPath(projectSlug, folderName));
}

describe("agentRunning", () => {
	beforeEach(() => {
		appDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-running-"));
	});
	afterEach(() => {
		fs.rmSync(appDir, { recursive: true, force: true });
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

	it("is true when the marker pid is alive", () => {
		writeMarker("proj", "ticket",
			JSON.stringify({ pid: process.pid }));
		expect(agentRunning("proj", "ticket")).toBe(true);
	});

	it("is false and reaps the marker when the pid is dead", () => {
		const p = writeMarker("proj", "ticket",
			JSON.stringify({ pid: 2147483646 }));
		expect(agentRunning("proj", "ticket")).toBe(false);
		expect(fs.existsSync(p)).toBe(false);
	});

	it("is false and reaps the marker when a live pid was reused", () => {
		const stale = JSON.stringify({ pid: process.pid, startSec: 0 });
		const p = writeMarker("proj", "ticket", stale);
		expect(agentRunning("proj", "ticket")).toBe(false);
		expect(fs.existsSync(p)).toBe(false);
	});

	it("is false on a malformed marker", () => {
		writeMarker("proj", "ticket", "not json");
		expect(agentRunning("proj", "ticket")).toBe(false);
	});
});
