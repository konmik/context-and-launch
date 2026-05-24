import type { APIEvent } from "@solidjs/start/server";
import { launcherConfigManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ request }: APIEvent) {
	try {
		const { name, text } = await request.json();
		launcherConfigManager.addSkill("app", "", { name, text });
		return new Response(null, { status: 201 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function PUT({ request }: APIEvent) {
	try {
		const { oldName, name, text } = await request.json();
		launcherConfigManager.updateSkill("app", "", oldName, { name, text });
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}

export async function DELETE({ request }: APIEvent) {
	try {
		const { name } = await request.json();
		launcherConfigManager.removeSkill("app", "", name);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 400 });
	}
}
