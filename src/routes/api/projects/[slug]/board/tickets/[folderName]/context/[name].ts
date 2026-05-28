import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function GET({ params }: APIEvent) {
  try {
    const { slug, folderName, name } = params;
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const content = new TicketStore(worktreeDir).getTicketContext(folderName, name);
    if (content === null) {
      return new Response(null, { status: 404 });
    }
    return Response.json({ content });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}

export async function DELETE({ params }: APIEvent) {
  try {
    const { slug, folderName, name } = params;
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).deleteTicketContext(folderName, name);
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}

export async function PUT({ params, request }: APIEvent) {
  try {
    const { slug, folderName, name } = params;
    const body = await request.json();
    const { content } = body as { content: string };
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).saveTicketContext(folderName, name, content);
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
