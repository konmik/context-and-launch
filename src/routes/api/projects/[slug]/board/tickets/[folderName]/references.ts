import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const body = await request.json();
    const paths: string[] = body.paths ?? [];
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const store = new TicketStore(worktreeDir);
    for (const p of paths) {
      store.addReference(folderName, p);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}

export async function DELETE({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const body = await request.json();
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).removeReference(folderName, body.path);
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
