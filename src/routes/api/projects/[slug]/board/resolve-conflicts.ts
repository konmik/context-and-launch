import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager, launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";
import { spawnProfile } from "~/server/agent-launch.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const body = await request.json();
		const profileName = body.profileName;
		if (!profileName) {
			return Response.json({ error: "No profile selected" }, { status: 400 });
		}

		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const merged = launcherConfigManager.getMergedConfig(slug);
		const profile = merged.profiles.find(p => p.name === profileName);

		if (!profile) {
			return Response.json(
				{ error: `Profile "${profileName}" not found. Check your launcher settings.` },
				{ status: 400 },
			);
		}

		const commandVars: Record<string, string> = {
			initialPrompt: merged.conflictResolutionPrompt,
			windowTitle: "Resolve Conflicts",
			appConfigDir: launcherConfigManager.getAppConfigDir(),
		};

		await spawnProfile(profile, commandVars, worktreeDir);

		return Response.json({ success: true });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}
