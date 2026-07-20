import spawn from "cross-spawn";
import { ProcessError } from "../shared/errors.js";

export type HerdrExecFn = (commandArgs: string[]) => Promise<string>;

const HERDR_TIMEOUT_MS = 10000;

function herdrCommand(): string {
	return process.env.CONTEXT_HERDR_COMMAND || "herdr";
}

export const execHerdr: HerdrExecFn = (commandArgs) => {
	const command = `${herdrCommand()} ${commandArgs.join(" ")}`;
	return new Promise((resolve, reject) => {
		const child = spawn(herdrCommand(), commandArgs, {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
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
		child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
		child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
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
};

function parseHerdrJson(output: string, command: string): Record<string, unknown> {
	try {
		return JSON.parse(output) as Record<string, unknown>;
	} catch {
		throw new Error(`Could not parse JSON output from '${command}'.`);
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

export async function listHerdrWorkspaces(exec: HerdrExecFn = execHerdr): Promise<HerdrWorkspace[]> {
	const output = await exec(["workspace", "list"]);
	const result = (parseHerdrJson(output, "herdr workspace list").result
		?? {}) as { workspaces?: unknown };
	if (!Array.isArray(result.workspaces)) {
		throw new Error("Missing workspaces array in output from 'herdr workspace list'.");
	}
	return result.workspaces as HerdrWorkspace[];
}

export async function listHerdrAgents(exec: HerdrExecFn = execHerdr): Promise<HerdrAgent[]> {
	const output = await exec(["agent", "list"]);
	const result = (parseHerdrJson(output, "herdr agent list").result
		?? {}) as { agents?: unknown };
	if (!Array.isArray(result.agents)) {
		throw new Error("Missing agents array in output from 'herdr agent list'.");
	}
	return result.agents as HerdrAgent[];
}
