import "server-only";
import { worktreeManager } from "../core/config/instances.js";
import { TicketStore } from "../core/ticket/ticket-store.js";
import { getMimeType } from "../core/shared/mime-types.js";
import { errorMessage } from "../core/shared/errors.js";

const ticketFilePathPattern = /^\/api\/projects\/([^/]+)\/board\/tickets\/([^/]+)\/files\/([^/]+)$/;
const ticketReferenceContentPathPattern = /^\/api\/projects\/([^/]+)\/board\/tickets\/([^/]+)\/references\/content$/;

export async function handleRawRoute(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  const fileMatch = url.pathname.match(ticketFilePathPattern);
  const referenceMatch = url.pathname.match(ticketReferenceContentPathPattern);
  if (!fileMatch && !referenceMatch) return undefined;
  try {
    const [, projectSlug, folderName, encodedFileName] = fileMatch ?? referenceMatch!;
    const store = new TicketStore(worktreeManager.getWorktreeDir(decodeURIComponent(projectSlug)));
    let content: Buffer;
    let fileName: string;
    if (fileMatch) {
      fileName = decodeURIComponent(encodedFileName);
      content = store.getFileContent(decodeURIComponent(folderName), fileName);
    } else {
      const refPath = url.searchParams.get("path");
      if (!refPath) return new Response("Missing path parameter", { status: 400 });
      fileName = refPath;
      content = store.getReferencedFileContent(decodeURIComponent(folderName), refPath);
    }
    return new Response(request.method === "HEAD" ? null : new Uint8Array(content), {
      headers: { "Content-Type": getMimeType(fileName) ?? "application/octet-stream" },
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
