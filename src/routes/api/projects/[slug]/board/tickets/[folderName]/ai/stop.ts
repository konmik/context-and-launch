import type { APIEvent } from "@solidjs/start/server";
import { sessionManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ params }: APIEvent) {
	try {
		const { slug, folderName } = params;
		sessionManager.stop(slug, folderName);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
