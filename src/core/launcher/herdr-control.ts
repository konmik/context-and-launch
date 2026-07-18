import spawn from "cross-spawn";
import path from "path";
import { ProcessError } from "../shared/errors.js";

export type HerdrExecFn = (commandArgs: string[]) => Promise<string>;

export type FindHerdrAgentResult =
	| { kind: "herdr-missing" }
	| { kind: "no-agent" }
	| { kind: "agent"; paneId: string; agentStatus: string };

export interface HerdrAgentTarget {
	projectSlug: string;
	folderName: string;
	agentWorktreePath: string;
}

const HERDR_TIMEOUT_MS = 30000;

function herdrCommand(): string {
	return process.env.CONTEXT_HERDR_COMMAND || "herdr";
}

export function execHerdr(commandArgs: string[]): Promise<string> {
	const command = `${herdrCommand()} ${commandArgs.join(" ")}`;
	return new Promise((resolve, reject) => {
		const child = spawn(herdrCommand(), commandArgs, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill();
			reject(new ProcessError(command, undefined, undefined, `${command} timed out`));
		}, HERDR_TIMEOUT_MS);
		child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
		child.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (code === 0) {
				resolve(stdout);
			} else {
				const output = (stderr || stdout || "").trim() || undefined;
				reject(new ProcessError(command, typeof code === "number" ? code : undefined, output));
			}
		});
	});
}

function hasEnoentCode(err: unknown): boolean {
	return typeof err === "object" && err !== null
		&& (err as { code?: unknown }).code === "ENOENT";
}

function parseHerdrJson(output: string, command: string): Record<string, unknown> {
	try {
		return JSON.parse(output) as Record<string, unknown>;
	} catch {
		throw new Error(`Could not parse JSON output from '${command}'.`);
	}
}

interface HerdrWorkspace {
	workspace_id: string;
	label?: string;
}

interface HerdrAgent {
	workspace_id: string;
	pane_id?: string;
	name?: string;
	cwd?: string;
	foreground_cwd?: string;
	agent_status?: string;
}

function normalizePath(value: string): string {
	const normalized = path.resolve(value);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function agentBelongsToTarget(agent: HerdrAgent, target: HerdrAgentTarget): boolean {
	const expectedName = `${target.projectSlug}--${target.folderName}`;
	if (agent.name === expectedName) return true;
	const expectedPath = normalizePath(target.agentWorktreePath);
	return [agent.cwd, agent.foreground_cwd]
		.some((candidate) => typeof candidate === "string"
			&& candidate.length > 0
			&& normalizePath(candidate) === expectedPath);
}

export async function findHerdrAgent(
	target: HerdrAgentTarget,
	exec: HerdrExecFn = execHerdr,
): Promise<FindHerdrAgentResult> {
	let workspaceOutput: string;
	try {
		workspaceOutput = await exec(["workspace", "list"]);
	} catch (err) {
		if (hasEnoentCode(err)) return { kind: "herdr-missing" };
		throw err;
	}

	const workspaceResult = (parseHerdrJson(workspaceOutput, "herdr workspace list").result
		?? {}) as { workspaces?: unknown };
	const workspaces = workspaceResult.workspaces;
	if (!Array.isArray(workspaces)) {
		throw new Error("Missing workspaces array in output from 'herdr workspace list'.");
	}

	const matchingWorkspaces = (workspaces as HerdrWorkspace[])
		.filter((w) => w.label === target.projectSlug);
	if (matchingWorkspaces.length > 1) {
		throw new Error(
			`Multiple Herdr workspaces are labeled '${target.projectSlug}'.`
			+ " Rename or close duplicates first.",
		);
	}
	if (matchingWorkspaces.length === 0) return { kind: "no-agent" };
	const workspaceId = matchingWorkspaces[0].workspace_id;

	const agentOutput = await exec(["agent", "list"]);
	const agentResult = (parseHerdrJson(agentOutput, "herdr agent list").result
		?? {}) as { agents?: unknown };
	const agents = agentResult.agents;
	if (!Array.isArray(agents)) {
		throw new Error("Missing agents array in output from 'herdr agent list'.");
	}

	const matchingAgents = (agents as HerdrAgent[])
		.filter((a) => a.workspace_id === workspaceId && agentBelongsToTarget(a, target));
	if (matchingAgents.length > 1) {
		const statuses = matchingAgents.map((a) => a.agent_status ?? "unknown");
		throw new Error(
			`Ticket '${target.folderName}' has multiple Herdr agents (${statuses.join(", ")}).`
			+ " Close duplicates first.",
		);
	}
	if (matchingAgents.length === 0) return { kind: "no-agent" };

	const agent = matchingAgents[0];
	if (!agent.pane_id) {
		throw new Error(`Herdr agent for ticket '${target.folderName}' has no pane id.`);
	}
	return { kind: "agent", paneId: agent.pane_id, agentStatus: agent.agent_status ?? "unknown" };
}

export async function stopHerdrAgent(paneId: string, exec: HerdrExecFn = execHerdr): Promise<void> {
	await exec(["pane", "close", paneId]);
}
