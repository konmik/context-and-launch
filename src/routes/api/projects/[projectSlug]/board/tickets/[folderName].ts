import { withTicketStore } from "~/server/shared/route-helpers.js";

export const PUT = withTicketStore(async (ctx, request) => {
	const body = await request.json();
	const { number, title, status } = body as Record<string, unknown>;
	if (number != null && typeof number !== "string") return new Response("number must be a string", { status: 400 });
	if (title != null && typeof title !== "string") return new Response("title must be a string", { status: 400 });
	if (status != null && typeof status !== "string") return new Response("status must be a string", { status: 400 });
	const updated = ctx.store.updateTicket(ctx.folderName, number ?? null, title ?? null, status ?? null);
	return Response.json({ success: true, folderName: updated.folderName });
});

export const DELETE = withTicketStore(async (ctx) => {
	ctx.store.deleteTicket(ctx.folderName);
	return Response.json({ success: true });
});
