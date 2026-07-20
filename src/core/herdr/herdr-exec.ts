import type { CommandTemplateKey } from '../command-template/command-template-definitions.js';
import type {
	CommandTemplateExecutor, CommandTemplateValues,
} from '../command-template/command-template-types.js';

/** Derived from the catalog, so a key that was never bundled cannot be named here. */
export type HerdrCommandTemplateKey = Extract<CommandTemplateKey, `herdr.${string}`>;

export type HerdrExecFn = (
	key: HerdrCommandTemplateKey, values?: CommandTemplateValues,
) => Promise<string>;

export function createHerdrExec(commands: CommandTemplateExecutor): HerdrExecFn {
	return (key, values = {}) => commands.execute(key, process.cwd(), values);
}

function parseHerdrJson(output: string, commandTemplateKey: string): Record<string, unknown> {
	try {
		return JSON.parse(output) as Record<string, unknown>;
	} catch {
		throw new Error(`Could not parse JSON output from '${commandTemplateKey}'.`);
	}
}

export interface HerdrWorkspace {
	workspace_id: string;
	label?: string;
}

export interface HerdrAgent {
	workspace_id?: string;
	pane_id?: string;
	name?: string;
	cwd?: string;
	foreground_cwd?: string;
	agent_status?: string;
}

export async function listHerdrWorkspaces(
	exec: HerdrExecFn, values: CommandTemplateValues = {},
): Promise<HerdrWorkspace[]> {
	const output = await exec('herdr.workspace.list', values);
	const result = (parseHerdrJson(output, 'herdr.workspace.list').result
		?? {}) as { workspaces?: unknown };
	if (!Array.isArray(result.workspaces)) {
		throw new Error("Missing workspaces array in output from 'herdr.workspace.list'.");
	}
	return result.workspaces as HerdrWorkspace[];
}

export async function listHerdrAgents(
	exec: HerdrExecFn, values: CommandTemplateValues = {},
): Promise<HerdrAgent[]> {
	const output = await exec('herdr.agent.list', values);
	const result = (parseHerdrJson(output, 'herdr.agent.list').result
		?? {}) as { agents?: unknown };
	if (!Array.isArray(result.agents)) {
		throw new Error("Missing agents array in output from 'herdr.agent.list'.");
	}
	return result.agents as HerdrAgent[];
}
