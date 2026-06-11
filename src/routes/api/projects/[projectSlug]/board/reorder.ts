import { withTicketStore, validated } from "~/server/shared/route-helpers.js";
import { ReorderTicketBody } from "~/server/ticket/ticket-store.js";

export const POST = withTicketStore(validated(ReorderTicketBody, async (ctx, body) => {
  ctx.store.moveTicket(body.folderName, body.fromColumn, body.toColumn, body.newIndex);
  return Response.json({ success: true });
}));
