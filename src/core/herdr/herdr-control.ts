import path from "path";
import { HerdrUnavailableError, type HerdrUnavailableReason } from "./herdr-availability.js";
import type { HerdrExecFn, HerdrAgent } from "./herdr-exec.js";
import { listHerdrTicketPanes } from "./herdr-ticket-panes.js";

export type { HerdrExecFn } from "./herdr-exec.js";

export type FindHerdrAgentResult =
	| { kind: "herdr-unavailable"; reason: HerdrUnavailableReason; message: string }
	| { kind: "no-agent" }
	| { kind: "agent"; paneId: string; agentStatus: string };

export interface HerdrAgentTarget {
	projectSlug: string;
	folderName: string;
}

export interface AgentBelongingTarget extends HerdrAgentTarget {
	agentWorktreePath: string;
}

function normalizePath(value: string): string {
	const normalized = path.resolve(value);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function agentBelongsToTarget(agent: HerdrAgent, target: AgentBelongingTarget): boolean {
	const expectedName = `${target.projectSlug}--${target.folderName}`;
	if (agent.name === expectedName) return true;
	const expectedPath = normalizePath(target.agentWorktreePath);
	return [agent.cwd, agent.foreground_cwd]
		.some((candidate) => candidate !== undefined
			&& candidate.length > 0
			&& normalizePath(candidate) === expectedPath);
}

export async function findHerdrAgent(
	target: HerdrAgentTarget,
	exec: HerdrExecFn,
): Promise<FindHerdrAgentResult> {
	let ticketPanes;
	try {
		ticketPanes = await listHerdrTicketPanes(target.projectSlug, exec);
	} catch (err) {
		if (err instanceof HerdrUnavailableError) {
			return { kind: "herdr-unavailable", reason: err.reason, message: err.message };
		}
		throw err;
	}

	const panes = ticketPanes.filter((candidate) => candidate.folderName === target.folderName);
	if (panes.length > 1) {
		throw new Error(
			`Ticket '${target.folderName}' has multiple Herdr panes. Rename or close duplicates first.`,
		);
	}
	if (panes.length === 0 || panes[0].agentStatuses.length === 0) {
		return { kind: "no-agent" };
	}
	const pane = panes[0];
	if (pane.agentStatuses.length > 1) {
		throw new Error(`Herdr pane '${pane.paneId}' has multiple agents.`);
	}
	return { kind: "agent", paneId: pane.paneId, agentStatus: pane.agentStatuses[0] };
}

export async function stopHerdrAgent(paneId: string, exec: HerdrExecFn): Promise<void> {
	await exec('herdr.agent.stop', { paneId });
}
