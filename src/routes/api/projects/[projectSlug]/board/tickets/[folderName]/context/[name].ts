import { withTicketStore } from "~/server/shared/route-helpers.js";

export const GET = withTicketStore(async (ctx) => {
  const content = ctx.store.getTicketContext(ctx.folderName, ctx.params.name);
  if (content === null) {
    return new Response(null, { status: 404 });
  }
  return Response.json({ content });
});

export const DELETE = withTicketStore(async (ctx) => {
  ctx.store.deleteTicketContext(ctx.folderName, ctx.params.name);
  return new Response(null, { status: 204 });
});

export const PUT = withTicketStore(async (ctx, request) => {
  const body = await request.json();
  const { content } = body as { content: string };
  ctx.store.saveTicketContext(ctx.folderName, ctx.params.name, content);
  return new Response(null, { status: 204 });
});
