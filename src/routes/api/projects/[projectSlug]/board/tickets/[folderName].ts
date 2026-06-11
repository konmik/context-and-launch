import { withTicketStore, validated } from "~/server/shared/route-helpers.js";
import { UpdateTicketBody } from "~/server/ticket/ticket-store.js";

export const PUT = withTicketStore(validated(UpdateTicketBody, async (ctx, body) => {
	const updated = ctx.store.updateTicket(
		ctx.folderName, body.number ?? null, body.title ?? null, body.status ?? null,
	);
	return Response.json({ success: true, folderName: updated.folderName });
}));

export const DELETE = withTicketStore(async (ctx) => {
	ctx.store.deleteTicket(ctx.folderName);
	return Response.json({ success: true });
});
