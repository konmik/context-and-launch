import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

export async function GET({ params }: APIEvent) {
  try {
    const { slug, folderName, stage } = params;
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const content = new TicketStore(worktreeDir).getStageMarkdown(folderName, stage);
    if (content === null) {
      return new Response(null, { status: 404 });
    }
    return Response.json({ content });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}

export async function PUT({ params, request }: APIEvent) {
  try {
    const { slug, folderName, stage } = params;
    const body = await request.json();
    const { content } = body as { content: string };
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    new TicketStore(worktreeDir).saveStageMarkdown(folderName, stage, content);
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
