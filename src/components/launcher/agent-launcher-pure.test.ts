import { describe, it, expect } from "vitest";
import {
	textToErrorInfo, resolveDefaults, buildLaunchBody,
	ticketAiUrl, parseLaunchResponse,
} from "./agent-launcher-pure.js";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";

describe("textToErrorInfo", () => {
	it("extracts description from withService error shape { error: string }", () => {
		const result = textToErrorInfo(
			'{"error":"Worktree root path is not configured"}',
			500,
		);
		expect(result).toEqual({
			description: "Worktree root path is not configured",
		});
	});

	it("returns full ErrorInfo when response has description", () => {
		const result = textToErrorInfo(
			'{"description":"Something failed","command":"git pull","output":"fatal: error"}',
			500,
		);
		expect(result).toEqual({
			description: "Something failed",
			command: "git pull",
			output: "fatal: error",
		});
	});

	it("falls back to JSON.stringify for unknown JSON shapes", () => {
		const result = textToErrorInfo('{"code":42}', 500);
		expect(result).toEqual({ description: '{"code":42}' });
	});

	it("uses plain text when response is not JSON", () => {
		const result = textToErrorInfo("Internal Server Error", 500);
		expect(result).toEqual({ description: "Internal Server Error" });
	});

	it("uses status code fallback for empty text", () => {
		const result = textToErrorInfo("", 502);
		expect(result).toEqual({ description: "Error 502" });
	});
});

describe("resolveDefaults", () => {
	const config = {
		templates: [{ name: "default", text: "" }],
		profiles: [{ name: "fast", command: "" }],
		skills: [],
		shortcuts: [],
		columnDefaults: {
			todo: {
				templateName: "custom",
				profileName: "slow",
				checkedSkills: ["lint"],
				skillOrder: ["lint", "test"],
			},
		},
	} as unknown as MergedLauncherConfig;

	it("returns column defaults when they exist", () => {
		const result = resolveDefaults(config, "todo");
		expect(result).toEqual({
			templateName: "custom",
			profileName: "slow",
			checkedSkills: ["lint"],
			skillOrder: ["lint", "test"],
		});
	});

	it("falls back to first template/profile when no column defaults", () => {
		const result = resolveDefaults(config, "done");
		expect(result).toEqual({
			templateName: "default",
			profileName: "fast",
			checkedSkills: [],
			skillOrder: [],
		});
	});

	it("returns empty defaults for null config", () => {
		const result = resolveDefaults(null, "todo");
		expect(result).toEqual({
			templateName: "",
			profileName: "",
			checkedSkills: [],
			skillOrder: [],
		});
	});
});

describe("buildLaunchBody", () => {
	it("builds body with all fields", () => {
		const result = buildLaunchBody("tmpl", ["s1"], true, "prof");
		expect(result).toEqual({
			templateName: "tmpl",
			checkedSkills: ["s1"],
			useWorktree: true,
			profileName: "prof",
		});
	});

	it("merges extra fields", () => {
		const result = buildLaunchBody("tmpl", [], false, "prof", { force: true });
		expect(result).toEqual({
			templateName: "tmpl",
			checkedSkills: [],
			useWorktree: false,
			profileName: "prof",
			force: true,
		});
	});
});

describe("ticketAiUrl", () => {
	it("builds the correct URL", () => {
		expect(ticketAiUrl("my-project", "TICKET-1", "run"))
			.toBe("/api/projects/my-project/board/tickets/TICKET-1/ai/run");
	});
});

describe("parseLaunchResponse", () => {
	it("returns ok for 200", () => {
		expect(parseLaunchResponse(200, "")).toEqual({ type: "ok" });
	});

	it("returns behindRemote for 409 with behindRemote flag", () => {
		const text = JSON.stringify({ behindRemote: true, message: "2 commits behind" });
		expect(parseLaunchResponse(409, text)).toEqual({
			type: "behindRemote",
			message: "2 commits behind",
		});
	});

	it("returns dirtyWorktree for 409 with dirtyWorktree flag", () => {
		const text = JSON.stringify({ dirtyWorktree: true, message: "uncommitted changes" });
		expect(parseLaunchResponse(409, text)).toEqual({
			type: "dirtyWorktree",
			message: "uncommitted changes",
		});
	});

	it("returns error for 409 without conflict flags", () => {
		const result = parseLaunchResponse(409, "Already started");
		expect(result.type).toBe("error");
	});

	it("returns error for 500", () => {
		const result = parseLaunchResponse(500, '{"error":"boom"}');
		expect(result).toEqual({
			type: "error",
			errorInfo: { description: "boom" },
		});
	});
});
