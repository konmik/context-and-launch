import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";
import { getMimeType } from "~/server/mime-types.js";

export async function GET({ params }: APIEvent) {
  try {
    const { slug, folderName, fileName } = params;
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const store = new TicketStore(worktreeDir);
    const content = store.getFileContent(folderName, fileName);
    const mimeType = getMimeType(fileName) ?? "application/octet-stream";
    return new Response(new Uint8Array(content), {
      headers: { "Content-Type": mimeType },
    });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}

export async function DELETE({ params }: APIEvent) {
  try {
    const { slug, folderName, fileName } = params;
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).deleteTicketFile(folderName, fileName);
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
