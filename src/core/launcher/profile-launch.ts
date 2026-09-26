import fs from "node:fs";
import path from "node:path";
import * as v from "valibot";
import type { CommandTemplateService } from "../command-template/command-template-service.js";
import type { LauncherProfile } from "./launcher-config.js";
import { isAlive } from "./process-utils.js";

const TITLE_SUFFIX = " -- AI";
const MARKER_START_TOLERANCE_SEC = 5;

const AgentMarkerSchema = v.object({
	pid: v.number(),
	startSec: v.optional(v.number()),
});

export function agentMarkerPathIn(
	appConfigDir: string,
	projectSlug: string,
	markerKey: string,
): string {
	return path.join(appConfigDir, "running", projectSlug, `${markerKey}.json`);
}

export function buildAgentDisplayName(
	ticket: { number: string; title: string },
	context: { projectName: string } | { worktreePath: string },
): string {
	return 'worktreePath' in context
		? path.basename(context.worktreePath)
		: `${ticket.title} ${ticket.number} - ${context.projectName}`;
}

export function buildWindowTitle(
	ticket: { number: string; title: string },
	context: { projectName: string } | { worktreePath: string },
): string {
	return buildAgentDisplayName(ticket, context) + TITLE_SUFFIX;
}

export function projectWindowTitle(projectName: string): string {
	return projectName + TITLE_SUFFIX;
}

export async function runLauncherProfile(
	commands: CommandTemplateService,
	profile: LauncherProfile,
	commandVars: Record<string, string>,
	cwd: string,
): Promise<void> {
	await commands.executeTrustedScript({
		source: { kind: 'profile', profileName: profile.name },
		script: profile.command,
		values: commandVars,
		knownScalarPlaceholders: Object.keys(commandVars),
		cwd,
		mode: 'detached',
	});
}

function processStartSec(commands: CommandTemplateService, pid: number): number | null {
	try {
		if (process.platform === "linux") {
			const raw = fs.readFileSync(`/proc/${pid}/stat`, "utf-8");
			const afterComm = raw.slice(raw.lastIndexOf(")") + 2);
			const startTicks = Number(afterComm.split(" ")[19]);
			const uptimeSec = Number(fs.readFileSync("/proc/uptime", "utf-8").split(" ")[0]);
			const bootSec = Math.floor(Date.now() / 1000 - uptimeSec);
			return bootSec + Math.floor(startTicks / 100);
		}
		if (process.platform === "darwin" || process.platform === "win32") {
			const out = commands.executeSync(
				process.platform === "darwin"
					? 'agent-launch.process-start.macos'
					: 'agent-launch.process-start.windows',
				process.cwd(),
				{ pid: String(pid) },
			).trim();
			return Math.floor(new Date(out).getTime() / 1000);
		}
		return null;
	} catch {
		return null;
	}
}

function reapMarker(markerPath: string): void {
	try {
		fs.rmSync(markerPath, { force: true });
	} catch (e) {
		console.warn(`Failed to reap stale agent marker ${markerPath}:`, e);
	}
}

export function isProfileAgentRunning(
	commands: CommandTemplateService,
	markerPath: string,
): boolean {
	let marker: v.InferOutput<typeof AgentMarkerSchema>;
	try {
		marker = v.parse(AgentMarkerSchema, JSON.parse(fs.readFileSync(markerPath, "utf-8")));
	} catch {
		return false;
	}
	const alive = isAlive(marker.pid);
	const osSec = alive && marker.startSec !== undefined ? processStartSec(commands, marker.pid) : null;
	if (!alive || (osSec !== null && marker.startSec !== undefined
		&& Math.abs(osSec - marker.startSec) > MARKER_START_TOLERANCE_SEC)) {
		reapMarker(markerPath);
		return false;
	}
	return true;
}
