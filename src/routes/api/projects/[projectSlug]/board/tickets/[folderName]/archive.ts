import { withTicketStore } from "~/server/shared/route-helpers.js";

export const POST = withTicketStore(async (ctx) => {
	ctx.store.archiveTicket(ctx.folderName);
	return Response.json({ success: true });
});
