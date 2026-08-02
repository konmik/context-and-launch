import { ProcessError } from "../shared/errors.js";
import type { HerdrExecFn } from "./herdr-exec.js";
import { listHerdrTicketPanes } from "./herdr-ticket-panes.js";

export type { HerdrExecFn } from "./herdr-exec.js";

export type FindHerdrAgentResult =
	| { kind: "herdr-missing" }
	| { kind: "no-agent" }
	| { kind: "agent"; paneId: string; agentStatus: string };

export interface HerdrAgentTarget {
	projectSlug: string;
	folderName: string;
}

function isHerdrMissing(err: unknown): boolean {
	return err instanceof ProcessError && err.kind === "command-not-found";
}

export async function findHerdrAgent(
	target: HerdrAgentTarget,
	exec: HerdrExecFn,
): Promise<FindHerdrAgentResult> {
	let ticketPanes;
	try {
		ticketPanes = await listHerdrTicketPanes(target.projectSlug, exec);
	} catch (err) {
		if (isHerdrMissing(err)) return { kind: "herdr-missing" };
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
