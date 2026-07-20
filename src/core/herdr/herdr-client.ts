import { listHerdrAgents, type HerdrAgent, type HerdrExecFn } from './herdr-exec.js';

export type HerdrAgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

export function ticketStatusesFromAgents(
	agents: HerdrAgent[], projectSlug: string,
): Record<string, HerdrAgentStatus> {
	const prefix = `${projectSlug}--`;
	const statuses: Record<string, HerdrAgentStatus> = {};
	for (const agent of agents) {
		if (typeof agent.agent_status !== 'string') continue;
		if (agent.name == null || !agent.name.startsWith(prefix)) continue;
		const folderName = agent.name.slice(prefix.length);
		statuses[folderName] = agent.agent_status as HerdrAgentStatus;
	}
	return statuses;
}

export async function fetchHerdrTicketStatuses(
	projectSlug: string, exec: HerdrExecFn,
): Promise<Record<string, HerdrAgentStatus>> {
	return ticketStatusesFromAgents(await listHerdrAgents(exec), projectSlug);
}
