import {
  resolveTicketAndProject,
  resolveLaunchDir,
  readLaunchRequest,
  launchAgent,
  agentRunning,
} from "~/server/launcher/agent-launch.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
  const { projectSlug, folderName } = params;
  const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
  if (agentRunning(projectSlug, folderName)) return new Response("Already started", { status: 409 });
  const launchRequest = await readLaunchRequest(request);
  const launchDir = await resolveLaunchDir(
    projectSlug, folderName, launchRequest.useWorktree, project.path, launchRequest.force, project.mainBranch,
  );
  await launchAgent(projectSlug, ticket, project, worktreeDir, launchRequest, launchDir);
  return new Response(null, { status: 200 });
});
