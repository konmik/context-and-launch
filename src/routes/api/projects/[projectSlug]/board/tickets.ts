import { withProject, validated } from "~/server/shared/route-helpers.js";
import { TicketStore, CreateTicketBody } from "~/server/ticket/ticket-store.js";
import { boardConfigManager, projectRegistry } from "~/server/config/instances.js";

export const POST = withProject(validated(CreateTicketBody, async (ctx, body) => {
	const boardId = projectRegistry.getBoardId(ctx.projectSlug);
	const columns = boardConfigManager.getConfig(boardId).columns;
	if (columns.length === 0) return new Response("Board has no columns configured", { status: 400 });
	new TicketStore(ctx.worktreeDir).createTicket(body.number, body.title, columns[0].name);
	return Response.json({ success: true });
}));
