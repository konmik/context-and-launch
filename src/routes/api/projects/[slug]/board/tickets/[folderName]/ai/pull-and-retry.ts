import type { APIEvent } from "@solidjs/start/server";
import { agentWorktreeManager } from "~/server/instances.js";
import { errorMessage } from "~/server/errors.js";
import {
  resolveTicketAndProject,
  readLaunchRequest,
  launchAgent,
} from "~/server/agent-launch.js";

export async function POST({ params, request }: APIEvent) {
  try {
    const { slug, folderName } = params;
    const resolved = resolveTicketAndProject(slug, folderName);
    if (resolved instanceof Response) return resolved;
    const { ticket, project, worktreeDir } = resolved;

    await agentWorktreeManager.pullMainBranch(project.path);

    const launchRequest = await readLaunchRequest(request);

    const worktreeResult = await agentWorktreeManager.ensureAgentWorktree(project.path, slug, folderName);
    if ('behindRemote' in worktreeResult) {
      return new Response("Still behind remote after pulling", { status: 500 });
    }

    await launchAgent(slug, ticket, project, worktreeDir, launchRequest, worktreeResult.worktreePath);
    return new Response(null, { status: 200 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }
}
