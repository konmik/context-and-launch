import {
	worktreeManager, launcherConfigManager, ticketSyncManager, operationTracker,
} from "~/server/config/instances.js";
import { agentMarkerPath, spawnProfile } from "~/server/launcher/agent-launch.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService, parseBody } from "~/server/shared/route-helpers.js";
import { ResolveConflictsBody } from "~/server/launcher/launcher-config.js";

export const POST = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { profileName } = await parseBody(request, ResolveConflictsBody);
	const merged = launcherConfigManager.getMergedConfig(projectSlug);
	const profile = merged.profiles.find(p => p.name === profileName);
	if (!profile) throw new ValidationError(`Profile "${profileName}" not found. Check your launcher settings.`);

	const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
	const plan = await operationTracker.track(ticketSyncManager.prepareResolution(worktreeDir));
	if (!plan.needsAgent) return Response.json({ success: true, resolved: true });

	const initialPrompt = `${merged.conflictResolutionPrompt}\n\n`
		+ `When the rebase is complete, push your result with:\n${plan.pushCommand}`;
	await spawnProfile(profile, {
		initialPrompt,
		windowTitle: "Resolve Conflicts",
		markerPath: agentMarkerPath(projectSlug, "__resolve-conflicts__"),
		appConfigDir: launcherConfigManager.getAppConfigDir(),
		configDefaultsDir: launcherConfigManager.getConfigDefaultsDir(),
	}, plan.scratchDir);
	return Response.json({ success: true });
});
