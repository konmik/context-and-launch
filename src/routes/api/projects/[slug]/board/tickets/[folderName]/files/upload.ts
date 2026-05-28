import { withTicketStore } from "~/server/shared/route-helpers.js";
import { errorMessage } from "~/server/shared/errors.js";

export const POST = withTicketStore(async (ctx, request) => {
  const formData = await request.formData();
  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const [, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    const fileName = value.name;
    try {
      const arrayBuffer = await value.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      ctx.store.copyFileToTicket(ctx.folderName, fileName, buffer);
      results.push({ name: fileName, ok: true });
    } catch (e) {
      results.push({ name: fileName, ok: false, error: errorMessage(e) });
    }
  }

  return Response.json({ results });
});
