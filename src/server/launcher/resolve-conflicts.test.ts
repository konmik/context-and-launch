import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/config/instances.js", () => ({
	worktreeManager: { getWorktreeDir: vi.fn().mockReturnValue("/fake/worktree") },
	launcherConfigManager: { getMergedConfig: vi.fn(), getAppConfigDir: vi.fn().mockReturnValue("/fake/config") },
}));
vi.mock("~/server/launcher/agent-launch.js", () => ({
	spawnProfile: vi.fn().mockResolvedValue(undefined),
	agentMarkerPath: vi.fn().mockReturnValue("/fake/config/running/test-project/__resolve-conflicts__.json"),
}));

import { POST } from "~/routes/api/projects/[projectSlug]/board/resolve-conflicts.js";
import { launcherConfigManager } from "~/server/config/instances.js";
import { spawnProfile } from "~/server/launcher/agent-launch.js";
import type { MergedLauncherConfig, LauncherProfile } from "~/server/launcher/launcher-config.js";

function makeMerged(
	overrides: Partial<MergedLauncherConfig> & { profiles: (LauncherProfile & { scope: "app" | "project" })[] },
): MergedLauncherConfig {
	return {
		templates: [],
		skills: [],
		shortcuts: [],
		columnDefaults: {},
		worktreeRootPath: null,
		boardId: null,
		conflictResolutionPrompt: "resolve conflicts",
		...overrides,
	};
}

function fakeEvent(projectSlug: string, body: Record<string, unknown> = {}) {
	return {
		params: { projectSlug },
		request: new Request("http://localhost/api/projects/" + projectSlug + "/board/resolve-conflicts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	} as unknown as Parameters<typeof POST>[0];
}

describe("resolve-conflicts profile lookup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 400 when no profileName is provided", async () => {
		const response = await POST(fakeEvent("test-project", {}));
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toMatch(/No profile selected/i);
		expect(spawnProfile).not.toHaveBeenCalled();
	});

	it("returns 400 when profileName does not match any profile", async () => {
		const profiles: (LauncherProfile & { scope: "app" | "project" })[] = [
			{ name: "Claude Win", command: "cmd /c claude", scope: "app" },
		];
		vi.mocked(launcherConfigManager.getMergedConfig).mockReturnValue(
			makeMerged({ profiles }),
		);

		const response = await POST(fakeEvent("test-project", { profileName: "Deleted Profile" }));
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toMatch(/Deleted Profile/i);
		expect(spawnProfile).not.toHaveBeenCalled();
	});

	it("launches the selected profile", async () => {
		const profiles: (LauncherProfile & { scope: "app" | "project" })[] = [
			{ name: "Claude Win", command: "cmd /c claude", scope: "app" },
		];
		vi.mocked(launcherConfigManager.getMergedConfig).mockReturnValue(
			makeMerged({ profiles }),
		);

		const response = await POST(fakeEvent("test-project", { profileName: "Claude Win" }));
		expect(response.status).toBe(200);
		expect(spawnProfile).toHaveBeenCalledWith(
			profiles[0],
			expect.objectContaining({ initialPrompt: "resolve conflicts" }),
			"/fake/worktree",
		);
	});
});
