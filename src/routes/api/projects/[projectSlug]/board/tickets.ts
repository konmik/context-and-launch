import { withProject } from "~/server/shared/route-helpers.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { boardConfigManager, projectRegistry } from "~/server/config/instances.js";

export const POST = withProject(async (ctx, request) => {
	const body = await request.json();
	const { number, title } = body as Record<string, unknown>;
	if (typeof number !== "string") return new Response("number must be a string", { status: 400 });
	if (typeof title !== "string") return new Response("title must be a string", { status: 400 });
	const boardId = projectRegistry.getBoardId(ctx.projectSlug);
	const columns = boardConfigManager.getConfig(boardId).columns;
	if (columns.length === 0) return new Response("Board has no columns configured", { status: 400 });
	new TicketStore(ctx.worktreeDir).createTicket(number, title, columns[0].name);
	return Response.json({ success: true });
});
