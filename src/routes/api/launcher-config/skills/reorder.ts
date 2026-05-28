import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function PUT({ request }: APIEvent) {
	try {
		const { name, order } = await request.json();
		launcherConfigManager.setSkillOrder("app", "", name, order);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
