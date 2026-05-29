import path from "path";
import { launcherConfigManager } from "~/server/config/instances.js";
import { resolveTicketAndProject, resolveLaunchDir, spawnDetached } from "~/server/launcher/agent-launch.js";
import { interpolateCommand } from "~/server/launcher/prompt-interpolation.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
	const { projectSlug, folderName } = params;
	const resolved = resolveTicketAndProject(projectSlug, folderName);
	if (resolved instanceof Response) return resolved;
	const { ticket, project, worktreeDir } = resolved;
	const { name, useWorktree, force } = await request.json();
	const merged = launcherConfigManager.getMergedConfig(projectSlug);
	const shortcut = merged.shortcuts.find(s => s.name === name);
	if (!shortcut) return new Response(`Shortcut "${name}" not found`, { status: 404 });
	const launchDirResult = await resolveLaunchDir(projectSlug, folderName, useWorktree, project.path, force);
	if (launchDirResult instanceof Response) return launchDirResult;
	const args = interpolateCommand(shortcut.command, {
		ticketDir: path.resolve(worktreeDir, ticket.folderName),
		ticketSlug: ticket.folderName, ticketTitle: ticket.title,
		ticketNumber: ticket.number, ticketStatus: ticket.status,
		projectPath: project.path, projectSlug, launchDir: launchDirResult,
	});
	await spawnDetached(args[0], args.slice(1), launchDirResult);
	return new Response(null, { status: 200 });
});
