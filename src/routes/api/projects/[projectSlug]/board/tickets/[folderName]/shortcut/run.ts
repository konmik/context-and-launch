import path from "path";
import { launcherConfigManager } from "~/server/config/instances.js";
import { resolveTicketAndProject, resolveLaunchDir } from "~/server/launcher/agent-launch.js";
import { spawnDetached } from "~/server/launcher/spawn-detached.js";
import { interpolateCommand } from "~/server/launcher/prompt-interpolation.js";
import { withService } from "~/server/shared/route-helpers.js";

export const POST = withService(async ({ params, request }) => {
	const { projectSlug, folderName } = params;
	const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
	const { name, useWorktree, force } = await request.json();
	const merged = launcherConfigManager.getMergedConfig(projectSlug);
	const shortcut = merged.shortcuts.find(s => s.name === name);
	if (!shortcut) return new Response(`Shortcut "${name}" not found`, { status: 404 });
	const launchDir = await resolveLaunchDir(
		projectSlug, folderName, useWorktree, project.path, force, project.mainBranch,
	);
	const args = interpolateCommand(shortcut.command, {
		ticketDir: path.resolve(worktreeDir, ticket.folderName),
		ticketSlug: ticket.folderName, ticketTitle: ticket.title,
		ticketNumber: ticket.number, ticketStatus: ticket.status,
		projectPath: project.path, projectSlug, launchDir,
	});
	await spawnDetached(args[0], args.slice(1), launchDir);
	return new Response(null, { status: 200 });
});
