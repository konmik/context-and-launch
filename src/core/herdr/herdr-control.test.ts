import { describe, it, expect } from "vitest";
import path from "path";
import { findHerdrAgent, stopHerdrAgent, type HerdrExecFn } from "./herdr-control.js";
import { ProcessError } from "../shared/errors.js";

const TARGET = {
	projectSlug: "alpha",
	folderName: "st-1",
	agentWorktreePath: path.resolve("worktrees", "st-1"),
};

interface FakeExecOptions {
	workspaces?: { workspace_id: string; label?: string }[];
	agents?: {
		workspace_id: string;
		pane_id?: string;
		name?: string;
		cwd?: string;
		foreground_cwd?: string;
		agent_status?: string;
	}[];
	workspaceListRaw?: string;
	agentListRaw?: string;
	workspaceListError?: unknown;
}

function fakeExec(opts: FakeExecOptions): { exec: HerdrExecFn; calls: string[][] } {
	const calls: string[][] = [];
	const exec: HerdrExecFn = async (commandArgs) => {
		calls.push(commandArgs);
		const verb = commandArgs.join(" ");
		if (verb === "workspace list") {
			if (opts.workspaceListError) throw opts.workspaceListError;
			if (opts.workspaceListRaw !== undefined) return opts.workspaceListRaw;
			return JSON.stringify({ result: { workspaces: opts.workspaces ?? [] } });
		}
		if (verb === "agent list") {
			if (opts.agentListRaw !== undefined) return opts.agentListRaw;
			return JSON.stringify({ result: { agents: opts.agents ?? [] } });
		}
		throw new Error(`unexpected call: ${verb}`);
	};
	return { exec, calls };
}

describe("findHerdrAgent", () => {
	it("returns herdr-missing when exec rejects with ENOENT", async () => {
		const exec: HerdrExecFn = async () => {
			throw Object.assign(new Error("spawn herdr ENOENT"), { code: "ENOENT" });
		};
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "herdr-missing" });
	});

	it("returns no-agent for an empty workspace list without calling agent list", async () => {
		const { exec, calls } = fakeExec({ workspaces: [] });
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
		expect(calls).toEqual([["workspace", "list"]]);
	});

	it("returns no-agent when the workspace matches but no agent matches", async () => {
		const { exec, calls } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			agents: [],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
		expect(calls).toEqual([["workspace", "list"], ["agent", "list"]]);
	});

	it("returns the matched agent with paneId and agentStatus", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			agents: [{ workspace_id: "w1", pane_id: "w1:p2", name: "alpha--st-1", agent_status: "working" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({
			kind: "agent", paneId: "w1:p2", agentStatus: "working",
		});
	});

	it("matches a nameless agent running in the ticket's Agent Worktree", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			agents: [{
				workspace_id: "w1",
				pane_id: "w1:p2",
				cwd: TARGET.agentWorktreePath + path.sep,
				agent_status: "working",
			}],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({
			kind: "agent", paneId: "w1:p2", agentStatus: "working",
		});
	});

	it("matches workspace labels case-sensitively", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "Alpha" }],
			agents: [{ workspace_id: "w1", pane_id: "w1:p2", name: "alpha--st-1", agent_status: "working" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
	});

	it("ignores an agent in a different workspace", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			agents: [{ workspace_id: "w2", pane_id: "w2:p1", name: "alpha--st-1", agent_status: "working" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
	});

	it("rejects when two workspaces share the label", async () => {
		const { exec } = fakeExec({
			workspaces: [
				{ workspace_id: "w1", label: "alpha" },
				{ workspace_id: "w2", label: "alpha" },
			],
		});
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Multiple Herdr workspaces are labeled 'alpha'.",
		);
	});

	it("rejects when two agents match", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			agents: [
				{ workspace_id: "w1", pane_id: "w1:p1", name: "alpha--st-1", agent_status: "working" },
				{ workspace_id: "w1", pane_id: "w1:p2", name: "alpha--st-1", agent_status: "idle" },
			],
		});
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Ticket 'st-1' has multiple Herdr agents (working, idle). Close duplicates first.",
		);
	});

	it("rejects the matched agent when it has no pane id", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			agents: [{ workspace_id: "w1", name: "alpha--st-1", agent_status: "working" }],
		});
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Herdr agent for ticket 'st-1' has no pane id.",
		);
	});

	it("propagates a nonzero-exit ProcessError from exec", async () => {
		const exec: HerdrExecFn = async () => {
			throw new ProcessError("herdr workspace list", 1, "boom");
		};
		await expect(findHerdrAgent(TARGET, exec)).rejects.toBeInstanceOf(ProcessError);
	});

	it("rejects on malformed JSON", async () => {
		const { exec } = fakeExec({ workspaceListRaw: "not json" });
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Could not parse JSON output from 'herdr workspace list'.",
		);
	});
});

describe("stopHerdrAgent", () => {
	it("invokes exec with pane close and the pane id", async () => {
		const calls: string[][] = [];
		const exec: HerdrExecFn = async (args) => { calls.push(args); return ""; };
		await stopHerdrAgent("w1:p2", exec);
		expect(calls).toEqual([["pane", "close", "w1:p2"]]);
	});

	it("propagates exec failure", async () => {
		const exec: HerdrExecFn = async () => { throw new Error("close failed"); };
		await expect(stopHerdrAgent("w1:p2", exec)).rejects.toThrow("close failed");
	});
});
