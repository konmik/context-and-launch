import { withTicketStore } from "~/server/shared/route-helpers.js";

export const POST = withTicketStore(async (ctx, request) => {
  const { folderName, fromColumn, toColumn, newIndex } = await request.json();
  ctx.store.moveTicket(folderName, fromColumn, toColumn, newIndex);
  return Response.json({ success: true });
});
