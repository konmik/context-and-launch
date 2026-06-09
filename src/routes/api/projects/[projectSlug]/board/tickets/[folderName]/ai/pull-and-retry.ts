import { agentWorktreeManager } from "~/server/config/instances.js";
import {
  resolveTicketAndProject,
  readLaunchRequest,
  launchAgent,
  agentRunning,
} from "~/server/launcher/agent-launch.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
  const { projectSlug, folderName } = params;
  const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
  if (agentRunning(projectSlug, folderName)) return new Response("Already started", { status: 409 });
  await agentWorktreeManager.pullMainBranch(project.path, project.mainBranch);
  const launchRequest = await readLaunchRequest(request);
  const worktreeResult = await agentWorktreeManager.ensureAgentWorktree(
    project.path, projectSlug, folderName, undefined, project.mainBranch,
  );
  if ('dirtyWorktree' in worktreeResult) {
    return Response.json(
      { dirtyWorktree: true, message: "Main branch has uncommitted changes. Launch anyway?" },
      { status: 409 },
    );
  }
  if ('behindRemote' in worktreeResult) {
    return new Response("Still behind remote after pulling", { status: 500 });
  }
  await launchAgent(projectSlug, ticket, project, worktreeDir, launchRequest, worktreeResult.worktreePath);
  return new Response(null, { status: 200 });
});
