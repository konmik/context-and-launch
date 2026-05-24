import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function GET() {
	try {
		const config = launcherConfigManager.loadAppConfig();
		return Response.json(config);
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}

export async function PUT({ request }: APIEvent) {
	try {
		const body = await request.json();
		launcherConfigManager.saveAppConfig(body);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
