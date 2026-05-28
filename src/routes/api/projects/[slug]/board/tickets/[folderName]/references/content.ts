import { withTicketStore } from "~/server/shared/route-helpers.js";
import { getMimeType } from "~/server/shared/mime-types.js";

export const GET = withTicketStore(async (ctx, request) => {
  const url = new URL(request.url);
  const refPath = url.searchParams.get("path");
  if (!refPath) {
    return new Response("Missing path parameter", { status: 400 });
  }
  const content = ctx.store.getReferencedFileContent(ctx.folderName, refPath);
  const mime = getMimeType(refPath) ?? "application/octet-stream";
  return new Response(new Uint8Array(content), {
    headers: { "Content-Type": mime },
  });
});
