import type { APIEvent } from "@solidjs/start/server";
import { sessionManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";

export async function GET({ params }: APIEvent) {
	try {
		const { slug } = params;
		const folderNames = sessionManager.getRunningFolderNames(slug);
		return Response.json({ folderNames });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
