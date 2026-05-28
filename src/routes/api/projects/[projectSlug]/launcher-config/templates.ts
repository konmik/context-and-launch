import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { name, text } = await request.json();
		launcherConfigManager.addTemplate("project", projectSlug, { name, text });
		return new Response(null, { status: 201 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}

export async function PUT({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { oldName, name, text } = await request.json();
		launcherConfigManager.updateTemplate("project", projectSlug, oldName, { name, text });
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}

export async function DELETE({ params, request }: APIEvent) {
	try {
		const { projectSlug } = params;
		const { name } = await request.json();
		launcherConfigManager.removeTemplate("project", projectSlug, name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 400 });
	}
}
