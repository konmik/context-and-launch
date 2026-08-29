import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MergedLauncherConfig, LauncherProfile } from "./launcher-config.js";
import { resolveConflictsWith, type ResolveConflictsDeps } from "./resolve-conflicts.js";

const profile: LauncherProfile & { scope: "app"; order: number } = {
  name: "Claude Win",
  command: "cmd /c claude",
  scope: "app",
  order: 0,
};

function mergedConfig(): MergedLauncherConfig {
  return {
    templates: [],
    skills: [],
    profiles: [profile],
    shortcuts: [],
    columnDefaults: {},
    worktreeRootPath: null,
    conflictResolutionPrompt: "resolve conflicts",
  };
}

function dependencies(): ResolveConflictsDeps {
  return {
    getMergedConfig: vi.fn(() => mergedConfig()),
    getWorktreeDir: vi.fn(() => "/fake/worktree"),
    prepareResolution: vi.fn(async () => ({
      needsAgent: true,
      scratchDir: "/fake/worktree-conflict-resolve",
      pushCommand: "git push origin HEAD:tickets",
    })),
    trackOperation: async (operation) => operation,
    spawnProfile: vi.fn(async () => undefined),
    markerPath: vi.fn(() => "/fake/config/running/test-project/__resolve-conflicts__.json"),
    getAppConfigDir: vi.fn(() => "/fake/config"),
    getConfigDefaultsDir: vi.fn(() => "/fake/config-defaults"),
  };
}

describe("resolveConflictsWith", () => {
  beforeEach(() => vi.clearAllMocks());

  it("launches the selected profile with the prepared resolution plan", async () => {
    const deps = dependencies();

    await resolveConflictsWith(deps, "test-project", "Claude Win");

    expect(deps.prepareResolution).toHaveBeenCalledWith("/fake/worktree");
    expect(deps.spawnProfile).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({
        initialPrompt: expect.stringContaining("git push origin HEAD:tickets"),
        herdrWorkspaceLabel: "test-project",
        herdrPaneLabel: "test-project--__resolve-conflicts__",
      }),
      "/fake/worktree-conflict-resolve",
    );
  });

  it("does not launch an agent when preparation completes the resolution", async () => {
    const deps = dependencies();
    deps.prepareResolution = vi.fn(async () => ({
      needsAgent: false,
      scratchDir: "",
      pushCommand: "",
    }));

    await resolveConflictsWith(deps, "test-project", "Claude Win");

    expect(deps.spawnProfile).not.toHaveBeenCalled();
  });

  it("rejects a profile that is not in merged configuration", async () => {
    const deps = dependencies();

    await expect(resolveConflictsWith(deps, "test-project", "Missing"))
      .rejects.toThrow('Profile "Missing" not found');
    expect(deps.prepareResolution).not.toHaveBeenCalled();
  });
});
