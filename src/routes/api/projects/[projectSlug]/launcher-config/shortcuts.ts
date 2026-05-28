import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { name, command } = await request.json();
		launcherConfigManager.addShortcut("project", projectSlug, { name, command });
		return new Response(null, { status: 201 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}

export async function PUT({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { oldName, name, command } = await request.json();
		launcherConfigManager.updateShortcut("project", projectSlug, oldName, { name, command });
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}

export async function DELETE({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { name } = await request.json();
		launcherConfigManager.removeShortcut("project", projectSlug, name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
