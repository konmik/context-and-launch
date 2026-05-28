import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { name, order } = await request.json();
		launcherConfigManager.setSkillOrder("project", slug, name, order);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
