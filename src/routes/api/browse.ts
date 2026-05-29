import { openFileDialog } from "~/server/infra/native-file-dialog.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async () => {
  const paths = await openFileDialog();
  return Response.json({ paths });
});
