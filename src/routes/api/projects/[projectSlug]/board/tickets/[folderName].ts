import { withTicketStore } from "~/server/shared/route-helpers.js";

export const PUT = withTicketStore(async (ctx, request) => {
	const { number, title, status } = await request.json();
	ctx.store.updateTicket(ctx.folderName, number ?? null, title ?? null, status ?? null);
	return Response.json({ success: true });
});

export const DELETE = withTicketStore(async (ctx) => {
	ctx.store.deleteTicket(ctx.folderName);
	return Response.json({ success: true });
});
