import { openFileDialog } from "~/server/native-file-dialog.js";
import { errorMessage } from "~/server/errors.js";

export async function POST() {
  try {
    const paths = await openFileDialog();
    return Response.json({ paths });
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }
}
