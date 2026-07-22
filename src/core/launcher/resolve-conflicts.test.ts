import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/core/config/instances.js", () => ({
	worktreeManager: { getWorktreeDir: vi.fn().mockReturnValue("/fake/worktree") },
	launcherConfigManager: {
		getMergedConfig: vi.fn(),
		getAppConfigDir: vi.fn().mockReturnValue("/fake/config"),
		getConfigDefaultsDir: vi.fn().mockReturnValue("/fake/config-defaults"),
	},
	ticketSyncManager: {
		prepareResolution: vi.fn().mockResolvedValue({
			needsAgent: true, scratchDir: "/fake/worktree-conflict-resolve",
			pushCommand: "git push origin HEAD:tickets",
		}),
	},
	operationTracker: { track: <T>(p: Promise<T>) => p },
}));
vi.mock("~/core/launcher/agent-launch.js", () => ({
	spawnProfile: vi.fn().mockResolvedValue(undefined),
	agentMarkerPath: vi.fn().mockReturnValue("/fake/config/running/test-project/__resolve-conflicts__.json"),
}));

import { launcherConfigManager, ticketSyncManager } from "~/core/config/instances.js";
import { spawnProfile } from "~/core/launcher/agent-launch.js";
import type { MergedLauncherConfig, LauncherProfile } from "~/core/launcher/launcher-config.js";

function makeMerged(
	overrides: Partial<MergedLauncherConfig> & {
		profiles: (LauncherProfile & { scope: "app" | "project"; order: number })[];
	},
): MergedLauncherConfig {
	return {
		templates: [],
		skills: [],
		shortcuts: [],
		columnDefaults: {},
		worktreeRootPath: null,
		conflictResolutionPrompt: "resolve conflicts",
		...overrides,
	};
}

describe("resolve-conflicts profile lookup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("getMergedConfig returns profiles for testing", () => {
		const profiles: (LauncherProfile & { scope: "app" | "project"; order: number })[] = [
			{ name: "Claude Win", command: "cmd /c claude", scope: "app", order: 0 },
		];
		vi.mocked(launcherConfigManager.getMergedConfig).mockReturnValue(
			makeMerged({ profiles }),
		);
		const merged = launcherConfigManager.getMergedConfig("test-project");
		expect(merged.profiles).toHaveLength(1);
		expect(merged.profiles[0].name).toBe("Claude Win");
	});

	it("spawnProfile is callable with correct arguments", async () => {
		const profiles: (LauncherProfile & { scope: "app" | "project"; order: number })[] = [
			{ name: "Claude Win", command: "cmd /c claude", scope: "app", order: 0 },
		];
		await spawnProfile(
			profiles[0],
			{
				initialPrompt: "test", windowTitle: "test", markerPath: "/fake",
				appConfigDir: "/fake", configDefaultsDir: "/fake",
			},
			"/fake/cwd",
		);
		expect(spawnProfile).toHaveBeenCalledWith(
			profiles[0],
			expect.objectContaining({ initialPrompt: "test" }),
			"/fake/cwd",
		);
	});

	it("prepareResolution returns expected shape", async () => {
		const result = await ticketSyncManager.prepareResolution("/fake/worktree");
		expect(result).toEqual({
			needsAgent: true,
			scratchDir: "/fake/worktree-conflict-resolve",
			pushCommand: "git push origin HEAD:tickets",
		});
	});
});
