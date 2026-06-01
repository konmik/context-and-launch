import { withProject } from "~/server/shared/route-helpers.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { boardConfigManager, projectRegistry } from "~/server/config/instances.js";

export const POST = withProject(async (ctx, request) => {
	const { number, title } = await request.json();
	const firstColumn = boardConfigManager.getConfig(projectRegistry.getBoardId(ctx.projectSlug)).columns[0]?.name;
	new TicketStore(ctx.worktreeDir).createTicket(number, title, firstColumn);
	return Response.json({ success: true });
});
