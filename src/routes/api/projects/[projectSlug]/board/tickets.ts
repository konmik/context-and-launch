import { withProject } from "~/server/shared/route-helpers.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { boardConfigManager, launcherConfigManager } from "~/server/config/instances.js";

export const POST = withProject(async (ctx, request) => {
	const { number, title } = await request.json();
	const merged = launcherConfigManager.getMergedConfig(ctx.projectSlug);
	const firstColumn = boardConfigManager.getConfig(merged.boardId).columns[0]?.name;
	new TicketStore(ctx.worktreeDir).createTicket(number, title, firstColumn);
	return Response.json({ success: true });
});
