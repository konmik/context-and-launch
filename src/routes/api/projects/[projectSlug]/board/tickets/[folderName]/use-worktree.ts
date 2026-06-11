import { withTicketStore, validated } from "~/server/shared/route-helpers.js";
import { UseWorktreeBody } from "~/server/ticket/ticket-store.js";

export const PUT = withTicketStore(validated(UseWorktreeBody, async (ctx, body) => {
  ctx.store.setUseWorktree(ctx.folderName, body.useWorktree);
  return new Response(null, { status: 204 });
}));
