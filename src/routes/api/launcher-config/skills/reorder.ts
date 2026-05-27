import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function PUT({ request }: APIEvent) {
	try {
		const { name, order } = await request.json();
		launcherConfigManager.setSkillOrder("app", "", name, order);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
