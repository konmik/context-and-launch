import { withTicketStore, validated } from "~/server/shared/route-helpers.js";
import { AddReferencesBody, RemoveReferenceBody } from "~/server/ticket/ticket-store.js";

export const POST = withTicketStore(validated(AddReferencesBody, async (ctx, body) => {
  for (const p of body.paths) {
    ctx.store.addReference(ctx.folderName, p);
  }
  return Response.json({ success: true });
}));

export const DELETE = withTicketStore(validated(RemoveReferenceBody, async (ctx, body) => {
  ctx.store.removeReference(ctx.folderName, body.path);
  return new Response(null, { status: 204 });
}));
