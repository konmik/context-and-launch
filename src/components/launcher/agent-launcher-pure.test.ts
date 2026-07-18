import { describe, it, expect } from "vitest";
import { resolveDefaults, computeLaunchDir, launchErrorInfo } from "./agent-launcher-pure.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

describe("launchErrorInfo", () => {
	it("keeps the structured error's description, command, and output", () => {
		const result = launchErrorInfo({
			message: "Failed (exit 1): Ticket 'st-47' already has a Herdr agent (idle).",
			errorInfo: {
				description: "Failed (exit 1)",
				command: "powershell -File run-agent-herdr.ps1",
				output: "Ticket 'st-47' already has a Herdr agent (idle).",
			},
		});
		expect(result).toEqual({
			title: "Launch failed",
			description: "Failed (exit 1)",
			command: "powershell -File run-agent-herdr.ps1",
			output: "Ticket 'st-47' already has a Herdr agent (idle).",
		});
	});

	it("falls back to the message when no structured error is present", () => {
		const result = launchErrorInfo({ message: "Already started" });
		expect(result).toEqual({ title: "Launch failed", description: "Already started" });
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

describe("computeLaunchDir", () => {
	it("useWorktree off returns projectPath", () => {
		const result = computeLaunchDir({
			useWorktree: false,
			projectPath: "/my/project",
			worktreeRootPath: "/custom/root",
			agentWorktreeDir: "/default/worktrees",
			folderName: "t-1-alpha",
		});
		expect(result).toBe("/my/project");
	});

	it("useWorktree on with explicit worktreeRootPath uses it", () => {
		const result = computeLaunchDir({
			useWorktree: true,
			projectPath: "/my/project",
			worktreeRootPath: "/custom/root",
			agentWorktreeDir: "/default/worktrees",
			folderName: "t-1-alpha",
		});
		expect(result).toBe("/custom/root/t-1-alpha");
	});

	it("useWorktree on with null worktreeRootPath falls back to agentWorktreeDir", () => {
		const result = computeLaunchDir({
			useWorktree: true,
			projectPath: "/my/project",
			worktreeRootPath: null,
			agentWorktreeDir: "/default/worktrees",
			folderName: "t-1-alpha",
		});
		expect(result).toBe("/default/worktrees/t-1-alpha");
	});

	it("long folderName is truncated by worktreeFolderName", () => {
		const longName = "t-1-" + "a".repeat(60);
		const result = computeLaunchDir({
			useWorktree: true,
			projectPath: "/my/project",
			worktreeRootPath: "/root",
			agentWorktreeDir: "/default",
			folderName: longName,
		});
		expect(result.length).toBeLessThan("/root/".length + longName.length);
		expect(result.startsWith("/root/")).toBe(true);
	});

	it("trailing slashes on root path are stripped", () => {
		const result = computeLaunchDir({
			useWorktree: true,
			projectPath: "/my/project",
			worktreeRootPath: "/custom/root///",
			agentWorktreeDir: "/default/worktrees",
			folderName: "t-1-alpha",
		});
		expect(result).toBe("/custom/root/t-1-alpha");
	});

	it("empty string worktreeRootPath falls back to agentWorktreeDir", () => {
		const result = computeLaunchDir({
			useWorktree: true,
			projectPath: "/my/project",
			worktreeRootPath: "",
			agentWorktreeDir: "/default/worktrees",
			folderName: "t-1-alpha",
		});
		expect(result).toBe("/default/worktrees/t-1-alpha");
	});
});
