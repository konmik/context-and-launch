import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { name, text } = await request.json();
		launcherConfigManager.addSkill("project", slug, { name, text });
		return new Response(null, { status: 201 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function PUT({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { oldName, name, text } = await request.json();
		launcherConfigManager.updateSkill("project", slug, oldName, { name, text });
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function DELETE({ params, request }: APIEvent) {
	try {
		const { slug } = params;
		const { name } = await request.json();
		launcherConfigManager.removeSkill("project", slug, name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
