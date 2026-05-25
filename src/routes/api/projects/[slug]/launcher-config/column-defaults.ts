import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { column, ...patch } = await request.json();
		launcherConfigManager.saveColumnDefaults(slug, column, patch);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
