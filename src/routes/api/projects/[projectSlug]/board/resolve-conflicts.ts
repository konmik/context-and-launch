import { worktreeManager, launcherConfigManager } from "~/server/config/instances.js";
import { agentMarkerPath, spawnProfile } from "~/server/launcher/agent-launch.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
	const { projectSlug } = params;
	const { profileName } = await request.json();
	if (!profileName) throw new ValidationError("No profile selected");
	const merged = launcherConfigManager.getMergedConfig(projectSlug);
	const profile = merged.profiles.find(p => p.name === profileName);
	if (!profile) throw new ValidationError(`Profile "${profileName}" not found. Check your launcher settings.`);
	await spawnProfile(profile, {
		initialPrompt: merged.conflictResolutionPrompt,
		windowTitle: "Resolve Conflicts",
		markerPath: agentMarkerPath(projectSlug, "__resolve-conflicts__"),
		appConfigDir: launcherConfigManager.getAppConfigDir(),
	}, worktreeManager.getWorktreeDir(projectSlug));
	return Response.json({ success: true });
});
