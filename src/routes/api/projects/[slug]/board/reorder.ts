import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ params, request }: APIEvent) {
  try {
    const { slug } = params;
    const { folderName, fromColumn, toColumn, newIndex } = await request.json();
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).moveTicket(folderName, fromColumn, toColumn, newIndex);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 400 });
  }
}
