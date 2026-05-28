import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { getMimeType } from "~/server/shared/mime-types.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function GET({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const url = new URL(request.url);
    const refPath = url.searchParams.get("path");
    if (!refPath) {
      return new Response("Missing path parameter", { status: 400 });
    }
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const content = new TicketStore(worktreeDir).getReferencedFileContent(folderName, refPath);
    const mime = getMimeType(refPath) ?? "application/octet-stream";
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": mime },
    });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
