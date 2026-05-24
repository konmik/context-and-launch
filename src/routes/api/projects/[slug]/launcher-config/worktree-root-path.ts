import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { worktreeRootPath } = await request.json();
		const value = typeof worktreeRootPath === "string" && worktreeRootPath.trim()
			? worktreeRootPath.trim()
			: undefined;
		launcherConfigManager.saveWorktreeRootPath(slug, value);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
