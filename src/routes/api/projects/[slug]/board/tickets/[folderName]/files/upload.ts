import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const store = new TicketStore(worktreeDir);

    const formData = await request.formData();
    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const [, value] of formData.entries()) {
      if (!(value instanceof File)) continue;
      const fileName = value.name;
      try {
        const arrayBuffer = await value.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        store.copyFileToTicket(folderName, fileName, buffer);
        results.push({ name: fileName, ok: true });
      } catch (e) {
        results.push({ name: fileName, ok: false, error: errorMessage(e) });
      }
    }

    return Response.json({ results });
  } catch (e) {
    return new Response(errorMessage(e), { status: 400 });
  }
}
