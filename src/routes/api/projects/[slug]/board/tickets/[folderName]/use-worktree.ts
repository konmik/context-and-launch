import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function PUT({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const body = await request.json();
    if (typeof body.useWorktree !== "boolean") {
      return new Response("useWorktree must be a boolean", { status: 400 });
    }
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).setUseWorktree(folderName, body.useWorktree);
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
