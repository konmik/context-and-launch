import { ValidationError } from "../shared/errors.js";
import type { MergedLauncherConfig, LauncherProfile } from "./launcher-config.js";
import type { ResolutionPlan } from "../ticket/ticket-sync.js";

export interface ResolveConflictsDeps {
  getMergedConfig: (projectSlug: string) => MergedLauncherConfig;
  getWorktreeDir: (projectSlug: string) => string;
  prepareResolution: (worktreeDir: string) => Promise<ResolutionPlan>;
  trackOperation: <T>(operation: Promise<T>) => Promise<T>;
  spawnProfile: (
    profile: LauncherProfile,
    commandVars: Record<string, string>,
    cwd: string,
  ) => Promise<void>;
  markerPath: (projectSlug: string, markerKey: string) => string;
  getAppConfigDir: () => string;
  getConfigDefaultsDir: () => string;
}

export async function resolveConflictsWith(
  deps: ResolveConflictsDeps,
  projectSlug: string,
  profileName: string,
): Promise<void> {
  const merged = deps.getMergedConfig(projectSlug);
  const profile = merged.profiles.find((candidate) => candidate.name === profileName);
  if (!profile) {
    throw new ValidationError(`Profile "${profileName}" not found. Check your launcher settings.`);
  }
  const worktreeDir = deps.getWorktreeDir(projectSlug);
  const plan = await deps.trackOperation(deps.prepareResolution(worktreeDir));
  if (!plan.needsAgent) return;

  const initialPrompt = `${merged.conflictResolutionPrompt}\n\n`
    + `When the rebase is complete, push your result with:\n${plan.pushCommand}`;
  await deps.spawnProfile(profile, {
    initialPrompt,
    windowTitle: "Resolve Conflicts",
    agentDisplayName: "Resolve Conflicts",
    herdrWorkspaceLabel: projectSlug,
    herdrPaneLabel: `${projectSlug}--__resolve-conflicts__`,
    markerPath: deps.markerPath(projectSlug, "__resolve-conflicts__"),
    appConfigDir: deps.getAppConfigDir(),
    configDefaultsDir: deps.getConfigDefaultsDir(),
  }, plan.scratchDir);
}
