import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/core/config/instances.js";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { getMimeType } from "~/core/shared/mime-types.js";
import { errorMessage } from "~/core/shared/errors.js";

export async function GET({ params }: APIEvent): Promise<Response> {
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(params.projectSlug);
    const store = new TicketStore(worktreeDir);
    const fileName = decodeURIComponent(params.fileName);
    const content = store.getFileContent(params.folderName, fileName);
    const mimeType = getMimeType(fileName) ?? "application/octet-stream";
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": mimeType },
    });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 500 });
  }
}
