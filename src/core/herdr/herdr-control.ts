import path from "path";
import {
	execHerdr, listHerdrAgents, listHerdrWorkspaces,
	type HerdrAgent, type HerdrExecFn,
} from "./herdr-exec.js";

export type { HerdrExecFn } from "./herdr-exec.js";

export type FindHerdrAgentResult =
	| { kind: "herdr-missing" }
	| { kind: "no-agent" }
	| { kind: "agent"; paneId: string; agentStatus: string };

export interface HerdrAgentTarget {
	projectSlug: string;
	folderName: string;
	agentWorktreePath: string;
}

function hasEnoentCode(err: unknown): boolean {
	return typeof err === "object" && err !== null
		&& (err as { code?: unknown }).code === "ENOENT";
}

function normalizePath(value: string): string {
	const normalized = path.resolve(value);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function agentBelongsToTarget(agent: HerdrAgent, target: HerdrAgentTarget): boolean {
	const expectedName = `${target.projectSlug}--${target.folderName}`;
	if (agent.name === expectedName) return true;
	const expectedPath = normalizePath(target.agentWorktreePath);
	return [agent.cwd, agent.foreground_cwd]
		.some((candidate) => typeof candidate === "string"
			&& candidate.length > 0
			&& normalizePath(candidate) === expectedPath);
}

export async function findHerdrAgent(
	target: HerdrAgentTarget,
	exec: HerdrExecFn = execHerdr,
): Promise<FindHerdrAgentResult> {
	let workspaces;
	try {
		workspaces = await listHerdrWorkspaces(exec);
	} catch (err) {
		if (hasEnoentCode(err)) return { kind: "herdr-missing" };
		throw err;
	}

	const matchingWorkspaces = workspaces.filter((w) => w.label === target.projectSlug);
	if (matchingWorkspaces.length > 1) {
		throw new Error(
			`Multiple Herdr workspaces are labeled '${target.projectSlug}'.`
			+ " Rename or close duplicates first.",
		);
	}
	if (matchingWorkspaces.length === 0) return { kind: "no-agent" };
	const workspaceId = matchingWorkspaces[0].workspace_id;

	const agents = await listHerdrAgents(exec);
	const matchingAgents = agents
		.filter((a) => a.workspace_id === workspaceId && agentBelongsToTarget(a, target));
	if (matchingAgents.length > 1) {
		const statuses = matchingAgents.map((a) => a.agent_status ?? "unknown");
		throw new Error(
			`Ticket '${target.folderName}' has multiple Herdr agents (${statuses.join(", ")}).`
			+ " Close duplicates first.",
		);
	}
	if (matchingAgents.length === 0) return { kind: "no-agent" };

	const agent = matchingAgents[0];
	if (!agent.pane_id) {
		throw new Error(`Herdr agent for ticket '${target.folderName}' has no pane id.`);
	}
	return { kind: "agent", paneId: agent.pane_id, agentStatus: agent.agent_status ?? "unknown" };
}

export async function stopHerdrAgent(paneId: string, exec: HerdrExecFn = execHerdr): Promise<void> {
	await exec(["pane", "close", paneId]);
}
