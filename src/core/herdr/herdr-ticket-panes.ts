import {
	listHerdrAgents, listHerdrPanes, listHerdrWorkspaces, type HerdrExecFn,
} from './herdr-exec.js';

export interface HerdrTicketPane {
	folderName: string;
	paneId: string;
	agentStatuses: string[];
}

export async function listHerdrTicketPanes(
	projectSlug: string, exec: HerdrExecFn,
): Promise<HerdrTicketPane[]> {
	const workspaces = (await listHerdrWorkspaces(exec))
		.filter((workspace) => workspace.label === projectSlug);
	if (workspaces.length > 1) {
		throw new Error(
			`Multiple Herdr workspaces are labeled '${projectSlug}'. Rename or close duplicates first.`,
		);
	}
	if (workspaces.length === 0) return [];

	const workspaceId = workspaces[0].workspace_id;
	const [panes, agents] = await Promise.all([
		listHerdrPanes(exec, workspaceId),
		listHerdrAgents(exec),
	]);
	const agentsByPaneId = new Map<string, typeof agents>();
	for (const agent of agents) {
		if (agent.workspace_id !== workspaceId || !agent.pane_id) continue;
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
	return ticketPanes;
}
