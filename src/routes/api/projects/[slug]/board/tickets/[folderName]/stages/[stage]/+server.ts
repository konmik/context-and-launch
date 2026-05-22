import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { worktreeManager } from '$lib/server/instances.js';
import { TicketStore } from '$lib/server/ticket-store.js';
import { errorMessage } from '$lib/server/errors.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { slug, folderName, stage } = params;
		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const content = new TicketStore(worktreeDir).getStageMarkdown(folderName, stage);
		if (content === null) {
			return new Response(null, { status: 404 });
		}
		return json({ content });
	} catch (e) {
		const message = errorMessage(e);
		return new Response(message, { status: 400 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const { slug, folderName, stage } = params;
		const body = await request.json();
		const { content } = body as { content: string };

		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		new TicketStore(worktreeDir).saveStageMarkdown(folderName, stage, content);
		return new Response(null, { status: 204 });
	} catch (e) {
		const message = errorMessage(e);
		return new Response(message, { status: 400 });
	}
};
