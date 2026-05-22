import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { worktreeManager } from '$lib/server/instances.js';
import { TicketStore } from '$lib/server/ticket-store.js';
import { errorMessage } from '$lib/server/errors.js';

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const { slug, folderName } = params;
		const body = await request.json();
		const { status } = body as { status: string };

		if (!status) {
			return new Response('Status is required', { status: 400 });
		}

		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const ticket = new TicketStore(worktreeDir).updateTicket(folderName, null, null, status);
		return json(ticket);
	} catch (e) {
		const message = errorMessage(e);
		return new Response(message, { status: 400 });
	}
};
