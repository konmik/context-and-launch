import { withTicketStore } from "~/server/shared/route-helpers.js";

export const POST = withTicketStore(async (ctx, request) => {
  const body = await request.json();
  const paths: string[] = body.paths ?? [];
  for (const p of paths) {
    ctx.store.addReference(ctx.folderName, p);
  }
  return Response.json({ success: true });
});

export const DELETE = withTicketStore(async (ctx, request) => {
  const body = await request.json();
  ctx.store.removeReference(ctx.folderName, body.path);
  return new Response(null, { status: 204 });
});
