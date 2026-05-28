import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { name, command } = await request.json();
		launcherConfigManager.addProfile("project", slug, { name, command });
		return new Response(null, { status: 201 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function PUT({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { oldName, name, command } = await request.json();
		launcherConfigManager.updateProfile("project", slug, oldName, { name, command });
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function DELETE({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { name } = await request.json();
		launcherConfigManager.removeProfile("project", slug, name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
