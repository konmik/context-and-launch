import { openFileDialog } from "~/server/infra/native-file-dialog.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ request }) => {
  const startDir = new URL(request.url).searchParams.get("startDir") ?? undefined;
  const paths = await openFileDialog(startDir);
  return Response.json({ paths });
});
