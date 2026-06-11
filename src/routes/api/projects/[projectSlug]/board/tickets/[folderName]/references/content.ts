import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/core/config/instances.js";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { getMimeType } from "~/core/shared/mime-types.js";
import { errorMessage } from "~/core/shared/errors.js";

export async function GET({ params, request }: APIEvent): Promise<Response> {
  try {
    const url = new URL(request.url);
    const refPath = url.searchParams.get("path");
    if (!refPath) {
      return new Response("Missing path parameter", { status: 400 });
    }
    const worktreeDir = worktreeManager.getWorktreeDir(params.projectSlug);
    const store = new TicketStore(worktreeDir);
    const content = store.getReferencedFileContent(params.folderName, refPath);
    const mime = getMimeType(refPath) ?? "application/octet-stream";
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": mime },
    });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
