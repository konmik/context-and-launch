import type { APIEvent } from "@solidjs/start/server";
import { sessionManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function GET({ params }: APIEvent) {
	try {
		const { slug, folderName } = params;
		const events = sessionManager.getHistory(slug, folderName);
		return Response.json({ events });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
