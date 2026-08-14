import {
	listHerdrAgents, listHerdrPanes, listHerdrWorkspaces,
	type HerdrAgent, type HerdrExecFn,
} from './herdr-exec.js';

export interface HerdrTicketPane {
	folderName: string;
	paneId: string;
	agentStatuses: string[];
}

/**
 * The ticket panes of one project together with the agents Herdr reported while
 * reading them. Callers that act on agents rather than panes need the raw list,
 * and returning it here keeps one Herdr poll serving both.
 */
export interface HerdrTicketPaneState {
	ticketPanes: HerdrTicketPane[];
	agents: HerdrAgent[];
}

export async function listHerdrTicketPanes(
	projectSlug: string, exec: HerdrExecFn,
): Promise<HerdrTicketPane[]> {
	return (await listHerdrTicketPaneState(projectSlug, exec)).ticketPanes;
}

export async function listHerdrTicketPaneState(
	projectSlug: string, exec: HerdrExecFn,
): Promise<HerdrTicketPaneState> {
	const workspaces = (await listHerdrWorkspaces(exec))
		.filter((workspace) => workspace.label === projectSlug);
	if (workspaces.length > 1) {
		throw new Error(
			`Multiple Herdr workspaces are labeled '${projectSlug}'. Rename or close duplicates first.`,
		);
	}
	// Without a workspace for this project Herdr cannot be hosting any of its
	// agents, so the answer is known without spawning a second Herdr process.
	if (workspaces.length === 0) return { ticketPanes: [], agents: [] };

	const workspaceId = workspaces[0].workspace_id;
	const [panes, agents] = await Promise.all([
		listHerdrPanes(exec, workspaceId),
		listHerdrAgents(exec),
	]);
	const workspaceAgents = agents.filter((agent) => agent.workspace_id === workspaceId);
	const agentsByPaneId = new Map<string, typeof workspaceAgents>();
	for (const agent of workspaceAgents) {
		if (!agent.pane_id) continue;
		const paneAgents = agentsByPaneId.get(agent.pane_id) ?? [];
		paneAgents.push(agent);
		agentsByPaneId.set(agent.pane_id, paneAgents);
	}

	const labelPrefix = `${projectSlug}--`;
	const ticketPanes: HerdrTicketPane[] = [];
	for (const pane of panes) {
		if (!pane.label?.startsWith(labelPrefix)) continue;
		const folderName = pane.label.slice(labelPrefix.length);
		const paneAgents = agentsByPaneId.get(pane.pane_id) ?? [];
		ticketPanes.push({
			folderName,
			paneId: pane.pane_id,
			agentStatuses: paneAgents.map((agent) => agent.agent_status ?? 'unknown'),
		});
	}
	return { ticketPanes, agents: workspaceAgents };
}
