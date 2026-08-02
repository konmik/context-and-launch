import type { HerdrExecFn } from './herdr-exec.js';
import {
	listHerdrTicketPanes, type HerdrTicketPane,
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

export async function fetchHerdrTicketStatuses(
	projectSlug: string, exec: HerdrExecFn,
): Promise<Record<string, HerdrAgentStatus>> {
	return ticketStatusesFromPanes(await listHerdrTicketPanes(projectSlug, exec));
}
