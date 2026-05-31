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
  const resolved = resolveTicketAndProject(projectSlug, folderName);
  if (resolved instanceof Response) return resolved;
  const { ticket, project, worktreeDir } = resolved;
  if (agentRunning(projectSlug, folderName)) return new Response("Already started", { status: 409 });
  const launchRequest = await readLaunchRequest(request);
  const launchDirResult = await resolveLaunchDir(
    projectSlug, folderName, launchRequest.useWorktree, project.path, launchRequest.force,
  );
  if (launchDirResult instanceof Response) return launchDirResult;
  await launchAgent(projectSlug, ticket, project, worktreeDir, launchRequest, launchDirResult);
  return new Response(null, { status: 200 });
});
