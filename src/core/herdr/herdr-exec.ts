import type { CommandTemplateKey } from '../command-template/command-template-definitions.js';
import type {
	CommandTemplateExecutor, CommandTemplateValues,
} from '../command-template/command-template-types.js';
import * as v from 'valibot';
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
	cause: unknown, exec: HerdrExecFn,
): Promise<HerdrUnavailableError | undefined> {
	if (!(cause instanceof ProcessError)) return undefined;
	if (cause.kind === 'command-not-found') return new HerdrUnavailableError('cli-missing');
	if (cause.kind !== 'exited') return undefined;
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

const HerdrWorkspaceSchema = v.object({
	workspace_id: v.string(),
	label: v.optional(v.string()),
});
const HerdrAgentSchema = v.object({
	workspace_id: v.optional(v.string()),
	pane_id: v.optional(v.string()),
	name: v.optional(v.string()),
	cwd: v.optional(v.string()),
	foreground_cwd: v.optional(v.string()),
	agent_status: v.optional(v.string()),
});
const HerdrPaneSchema = v.object({
	workspace_id: v.string(),
	pane_id: v.string(),
	label: v.optional(v.string()),
});
const missingWorkspaces = "Missing workspaces array in output from 'herdr.workspace.list'.";
const missingAgents = "Missing agents array in output from 'herdr.agent.list'.";
const missingPanes = "Missing panes array in output from 'herdr.pane.list'.";
const HerdrWorkspaceListJsonSchema = v.pipe(
	v.string(),
	v.parseJson({}, "Could not parse JSON output from 'herdr.workspace.list'."),
	v.message(v.object({
		result: v.object({ workspaces: v.array(HerdrWorkspaceSchema) }),
	}), missingWorkspaces),
);
const HerdrAgentListJsonSchema = v.pipe(
	v.string(),
	v.parseJson({}, "Could not parse JSON output from 'herdr.agent.list'."),
	v.message(v.object({
		result: v.object({ agents: v.array(HerdrAgentSchema) }),
	}), missingAgents),
);
const HerdrPaneListJsonSchema = v.pipe(
	v.string(),
	v.parseJson({}, "Could not parse JSON output from 'herdr.pane.list'."),
	v.message(v.object({
		result: v.object({ panes: v.array(HerdrPaneSchema) }),
	}), missingPanes),
);

export type HerdrWorkspace = v.InferOutput<typeof HerdrWorkspaceSchema>;
export type HerdrAgent = v.InferOutput<typeof HerdrAgentSchema>;
export type HerdrPane = v.InferOutput<typeof HerdrPaneSchema>;

export async function listHerdrWorkspaces(
	exec: HerdrExecFn, values: CommandTemplateValues = {},
): Promise<HerdrWorkspace[]> {
	const output = await exec('herdr.workspace.list', values);
	return v.parse(HerdrWorkspaceListJsonSchema, output).result.workspaces;
}

export async function listHerdrAgents(
	exec: HerdrExecFn, values: CommandTemplateValues = {},
): Promise<HerdrAgent[]> {
	const output = await exec('herdr.agent.list', values);
	return v.parse(HerdrAgentListJsonSchema, output).result.agents;
}

export async function listHerdrPanes(
	exec: HerdrExecFn, workspaceId: string,
): Promise<HerdrPane[]> {
	const output = await exec('herdr.pane.list', { workspaceId });
	return v.parse(HerdrPaneListJsonSchema, output).result.panes;
}
