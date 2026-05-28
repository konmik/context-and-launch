import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { worktreeRootPath } = await request.json();
		const value = typeof worktreeRootPath === "string" && worktreeRootPath.trim()
			? worktreeRootPath.trim()
			: undefined;
		launcherConfigManager.saveWorktreeRootPath(projectSlug, value);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}
