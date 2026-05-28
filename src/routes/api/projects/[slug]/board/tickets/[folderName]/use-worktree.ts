import { withTicketStore } from "~/server/shared/route-helpers.js";

export const PUT = withTicketStore(async (ctx, request) => {
  const body = await request.json();
  if (typeof body.useWorktree !== "boolean") {
    return new Response("useWorktree must be a boolean", { status: 400 });
  }
  ctx.store.setUseWorktree(ctx.folderName, body.useWorktree);
  return new Response(null, { status: 204 });
});
