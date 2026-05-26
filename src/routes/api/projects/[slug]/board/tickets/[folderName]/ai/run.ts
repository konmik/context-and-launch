import type { APIEvent } from "@solidjs/start/server";
import { errorPayload } from "~/server/errors.js";
import {
  resolveTicketAndProject,
  resolveLaunchDir,
  readLaunchRequest,
  buildWindowTitle,
  launchAgent,
  windowExists,
} from "~/server/agent-launch.js";

export async function POST({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const resolved = resolveTicketAndProject(slug, folderName);
    if (resolved instanceof Response) return resolved;
    const { ticket, project, worktreeDir } = resolved;

    const windowTitle = buildWindowTitle(ticket);
    if (await windowExists(windowTitle)) {
      return new Response("Already started", { status: 409 });
    }

    const launchRequest = await readLaunchRequest(request);

    const launchDirResult = await resolveLaunchDir(slug, folderName, launchRequest.useWorktree, project.path);
    if (launchDirResult instanceof Response) return launchDirResult;
    const launchDir = launchDirResult;

    await launchAgent(slug, ticket, project, worktreeDir, launchRequest, launchDir);
    return new Response(null, { status: 200 });
  } catch (e) {
    return Response.json(errorPayload(e), { status: 500 });
  }
}
