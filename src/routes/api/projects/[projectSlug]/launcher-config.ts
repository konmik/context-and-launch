import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function GET({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const url = new URL(request.url);
		if (url.searchParams.get("raw") === "true") {
			const config = launcherConfigManager.loadProjectConfig(projectSlug);
			return Response.json(config);
		}
		const merged = launcherConfigManager.getMergedConfig(projectSlug);
		return Response.json(merged);
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}

export async function PUT({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const body = await request.json();
		launcherConfigManager.saveProjectConfig(projectSlug, body);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}
