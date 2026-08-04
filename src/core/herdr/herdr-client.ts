import type { HerdrAgent, HerdrExecFn } from './herdr-exec.js';
import {
	listHerdrTicketPaneState, type HerdrTicketPane,
} from './herdr-ticket-panes.js';

export type HerdrAgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

export function ticketStatusesFromPanes(
	panes: HerdrTicketPane[],
): Record<string, HerdrAgentStatus> {
	const statuses: Record<string, HerdrAgentStatus> = {};
	const seenFolderNames = new Set<string>();
	for (const pane of panes) {
		if (seenFolderNames.has(pane.folderName)) {
			statuses[pane.folderName] = 'unknown';
			continue;
		}
		seenFolderNames.add(pane.folderName);
		if (pane.agentStatuses.length === 0) continue;
		statuses[pane.folderName] = pane.agentStatuses.length === 1
			? pane.agentStatuses[0] as HerdrAgentStatus
			: 'unknown';
	}
	return statuses;
}

export interface HerdrTicketState {
	statusesByFolderName: Record<string, HerdrAgentStatus>;
	agents: HerdrAgent[];
}

export async function fetchHerdrTicketState(
	projectSlug: string, exec: HerdrExecFn,
): Promise<HerdrTicketState> {
	const { ticketPanes, agents } = await listHerdrTicketPaneState(projectSlug, exec);
	return { statusesByFolderName: ticketStatusesFromPanes(ticketPanes), agents };
}

export async function fetchHerdrTicketStatuses(
	projectSlug: string, exec: HerdrExecFn,
): Promise<Record<string, HerdrAgentStatus>> {
	return (await fetchHerdrTicketState(projectSlug, exec)).statusesByFolderName;
}
