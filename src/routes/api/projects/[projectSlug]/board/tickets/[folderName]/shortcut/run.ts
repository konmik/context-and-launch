import type { APIEvent } from "@solidjs/start/server";
import path from "path";
import { launcherConfigManager } from "~/server/config/instances.js";
import { errorPayload } from "~/server/shared/errors.js";
import { resolveTicketAndProject, resolveLaunchDir, spawnDetached } from "~/server/launcher/agent-launch.js";
import { splitCommand } from "~/server/launcher/prompt-interpolation.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { projectSlug, folderName } = params;
		const resolved = resolveTicketAndProject(projectSlug, folderName);
		if (resolved instanceof Response) return resolved;
		const { ticket, project, worktreeDir } = resolved;

		const { name, useWorktree, force } = await request.json();
		const merged = launcherConfigManager.getMergedConfig(projectSlug);
		const shortcut = merged.shortcuts.find(s => s.name === name);
		if (!shortcut) {
			return new Response(`Shortcut "${name}" not found`, { status: 404 });
		}

		const launchDirResult = await resolveLaunchDir(projectSlug, folderName, useWorktree, project.path, force);
		if (launchDirResult instanceof Response) return launchDirResult;
		const launchDir = launchDirResult;

		const ticketDir = path.resolve(worktreeDir, ticket.folderName);
		const variables: Record<string, string> = {
			ticketDir,
			ticketSlug: ticket.folderName,
			ticketTitle: ticket.title,
			ticketNumber: ticket.number,
			ticketStatus: ticket.status,
			projectPath: project.path,
			projectSlug,
			launchDir,
		};

		const interpolated = splitCommand(shortcut.command).map(part =>
			part.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match)
		);
		const executable = interpolated[0];
		const args = interpolated.slice(1);

		await spawnDetached(executable, args, launchDir);

		return new Response(null, { status: 200 });
	} catch (e) {
		return Response.json(errorPayload(e), { status: 500 });
	}
}
