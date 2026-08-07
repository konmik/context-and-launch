import type { CommandTemplateKey } from '../command-template/command-template-definitions.js';
import type {
	CommandTemplateExecutor, CommandTemplateValues,
} from '../command-template/command-template-types.js';
import { ProcessError } from '../shared/errors.js';
import { HerdrUnavailableError } from './herdr-availability.js';

/** Derived from the catalog, so a key that was never bundled cannot be named here. */
export type HerdrCommandTemplateKey = Extract<CommandTemplateKey, `herdr.${string}`>;

export type HerdrExecFn = (
	key: HerdrCommandTemplateKey, values?: CommandTemplateValues,
) => Promise<string>;

type HerdrServerStatus = 'running' | 'not-running';

/** `herdr status server` reports `status: running` or `status: not running`. */
function serverStatusFromOutput(output: string): HerdrServerStatus | undefined {
	for (const line of output.split(/\r?\n/)) {
		const separator = line.indexOf(':');
		if (separator < 0 || line.slice(0, separator).trim() !== 'status') continue;
		const value = line.slice(separator + 1).trim();
		if (value === 'running') return 'running';
		if (value === 'not running') return 'not-running';
		return undefined;
	}
	return undefined;
}

/**
 * A Herdr command that exits non-zero cannot say on its own whether Herdr
 * rejected the request or was never reachable, so the status probe answers that
 * question once, at the boundary, instead of every caller guessing from output.
 */
async function herdrUnavailability(
	error: unknown, exec: HerdrExecFn,
): Promise<HerdrUnavailableError | undefined> {
	if (!(error instanceof ProcessError)) return undefined;
	if (error.kind === 'command-not-found') return new HerdrUnavailableError('cli-missing');
	if (error.kind !== 'exited') return undefined;
	let status: HerdrServerStatus | undefined;
	try {
		status = serverStatusFromOutput(await exec('herdr.status.server'));
	} catch (probeError) {
		if (probeError instanceof ProcessError && probeError.kind === 'command-not-found') {
			return new HerdrUnavailableError('cli-missing');
		}
		return undefined;
	}
	return status === 'not-running' ? new HerdrUnavailableError('server-not-running') : undefined;
}

export function createHerdrExec(commands: CommandTemplateExecutor): HerdrExecFn {
	const run: HerdrExecFn = (key, values = {}) => commands.execute(key, process.cwd(), values);
	return async (key, values = {}) => {
		try {
			return await run(key, values);
		} catch (error) {
			throw (await herdrUnavailability(error, run)) ?? error;
		}
	};
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

export interface HerdrPane {
	workspace_id: string;
	pane_id: string;
	label?: string;
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

export async function listHerdrPanes(
	exec: HerdrExecFn, workspaceId: string,
): Promise<HerdrPane[]> {
	const output = await exec('herdr.pane.list', { workspaceId });
	const result = (parseHerdrJson(output, 'herdr.pane.list').result
		?? {}) as { panes?: unknown };
	if (!Array.isArray(result.panes)) {
		throw new Error("Missing panes array in output from 'herdr.pane.list'.");
	}
	return result.panes as HerdrPane[];
}
