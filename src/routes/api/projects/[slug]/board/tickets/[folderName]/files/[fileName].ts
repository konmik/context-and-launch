import { withTicketStore } from "~/server/shared/route-helpers.js";
import { getMimeType } from "~/server/shared/mime-types.js";

export const GET = withTicketStore(async (ctx) => {
  const content = ctx.store.getFileContent(ctx.folderName, ctx.params.fileName);
  const mimeType = getMimeType(ctx.params.fileName) ?? "application/octet-stream";
  return new Response(new Uint8Array(content), {
    headers: { "Content-Type": mimeType },
  });
});

export const DELETE = withTicketStore(async (ctx) => {
  ctx.store.deleteTicketFile(ctx.folderName, ctx.params.fileName);
  return new Response(null, { status: 204 });
});
