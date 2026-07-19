import spawn from 'cross-spawn';
import { ProcessError } from '../shared/errors.js';

export type HerdrAgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

export function usesHerdrLaunchTarget(command: string): boolean {
	return command.includes('run-agent-herdr');
}

export interface HerdrCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export type HerdrCommandRunner = (args: string[]) => Promise<HerdrCommandResult>;

interface ParsedHerdrAgent {
	name?: string;
	agentStatus: HerdrAgentStatus;
}

export function parseHerdrAgentList(stdout: string): ParsedHerdrAgent[] {
	const parsed = JSON.parse(stdout) as unknown;
	const agents = (parsed as { result?: { agents?: unknown } })?.result?.agents;
	if (!Array.isArray(agents)) {
		throw new Error(`Unexpected herdr agent list output: ${stdout.slice(0, 500)}`);
	}
	const parsedAgents: ParsedHerdrAgent[] = [];
	for (const raw of agents) {
		const agent = raw as { name?: unknown; agent_status?: unknown };
		if (typeof agent.agent_status !== 'string') continue;
		parsedAgents.push({
			name: typeof agent.name === 'string' ? agent.name : undefined,
			agentStatus: agent.agent_status as HerdrAgentStatus,
		});
	}
	return parsedAgents;
}

export function ticketStatusesFromAgents(
	agents: ParsedHerdrAgent[], projectSlug: string,
): Record<string, HerdrAgentStatus> {
	const prefix = `${projectSlug}--`;
	const statuses: Record<string, HerdrAgentStatus> = {};
	for (const agent of agents) {
		if (agent.name == null || !agent.name.startsWith(prefix)) continue;
		const folderName = agent.name.slice(prefix.length);
		statuses[folderName] = agent.agentStatus;
	}
	return statuses;
}

const HERDR_TIMEOUT_MS = 10000;

const defaultHerdrRunner: HerdrCommandRunner = (args) => {
	return new Promise<HerdrCommandResult>((resolve, reject) => {
		const child = spawn('herdr', args, {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill();
			reject(new Error(`herdr agent list timed out after ${HERDR_TIMEOUT_MS / 1000}s`));
		}, HERDR_TIMEOUT_MS);
		child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
		child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
		child.on('error', (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ exitCode: code === null ? -1 : code, stdout, stderr });
		});
	});
};

export async function fetchHerdrTicketStatuses(
	projectSlug: string, runHerdr: HerdrCommandRunner = defaultHerdrRunner,
): Promise<Record<string, HerdrAgentStatus>> {
	const result = await runHerdr(['agent', 'list']);
	if (result.exitCode !== 0) {
		throw new ProcessError('herdr agent list', result.exitCode, result.stderr || result.stdout);
	}
	return ticketStatusesFromAgents(parseHerdrAgentList(result.stdout), projectSlug);
}
