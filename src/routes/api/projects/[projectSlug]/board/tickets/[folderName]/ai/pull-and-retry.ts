import type { APIEvent } from "@solidjs/start/server";
import { agentWorktreeManager } from "~/server/config/instances.js";
import { errorPayload } from "~/server/shared/errors.js";
import {
  resolveTicketAndProject,
  readLaunchRequest,
  launchAgent,
} from "~/server/launcher/agent-launch.js";

export async function POST({ params, request }: APIEvent) {
  try {
    const { projectSlug, folderName } = params;
    const resolved = resolveTicketAndProject(projectSlug, folderName);
    if (resolved instanceof Response) return resolved;
    const { ticket, project, worktreeDir } = resolved;

    await agentWorktreeManager.pullMainBranch(project.path);

    const launchRequest = await readLaunchRequest(request);

    const worktreeResult = await agentWorktreeManager.ensureAgentWorktree(project.path, projectSlug, folderName);
    if ('dirtyWorktree' in worktreeResult) {
      return Response.json(
        { dirtyWorktree: true, message: "Main branch has uncommitted changes. Launch anyway?" },
        { status: 409 }
      );
    }
    if ('behindRemote' in worktreeResult) {
      return new Response("Still behind remote after pulling", { status: 500 });
    }

    await launchAgent(projectSlug, ticket, project, worktreeDir, launchRequest, worktreeResult.worktreePath);
    return new Response(null, { status: 200 });
  } catch (e) {
    return Response.json(errorPayload(e), { status: 500 });
  }
}
