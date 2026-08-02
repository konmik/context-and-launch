import { describe, expect, it } from "vitest";
import {
	findHerdrAgent, stopHerdrAgent, type HerdrExecFn,
} from "./herdr-control.js";
import { ProcessError } from "../shared/errors.js";

const TARGET = { projectSlug: "alpha", folderName: "st-1" };

interface FakeExecOptions {
	workspaces?: { workspace_id: string; label?: string }[];
	panes?: { workspace_id: string; pane_id: string; label?: string }[];
	agents?: {
		workspace_id: string;
		pane_id?: string;
		agent_status?: string;
	}[];
	workspaceListRaw?: string;
	workspaceListError?: unknown;
}

function fakeExec(opts: FakeExecOptions): { exec: HerdrExecFn; calls: string[] } {
	const calls: string[] = [];
	const exec: HerdrExecFn = async (key) => {
		calls.push(key);
		if (key === "herdr.workspace.list") {
			if (opts.workspaceListError) throw opts.workspaceListError;
			if (opts.workspaceListRaw !== undefined) return opts.workspaceListRaw;
			return JSON.stringify({ result: { workspaces: opts.workspaces ?? [] } });
		}
		if (key === "herdr.pane.list") {
			return JSON.stringify({ result: { panes: opts.panes ?? [] } });
		}
		if (key === "herdr.agent.list") {
			return JSON.stringify({ result: { agents: opts.agents ?? [] } });
		}
		throw new Error(`unexpected call: ${key}`);
	};
	return { exec, calls };
}

describe("findHerdrAgent", () => {
	it("returns herdr-missing when the command could not be resolved", async () => {
		const exec: HerdrExecFn = async () => {
			throw new ProcessError("herdr", 127, "not found", undefined, "command-not-found");
		};
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "herdr-missing" });
	});

	it("does not treat a herdr that ran and failed as missing", async () => {
		const exec: HerdrExecFn = async () => {
			throw new ProcessError("herdr", 1, "'herdr' is not recognized", undefined, "exited");
		};
		await expect(findHerdrAgent(TARGET, exec)).rejects.toBeInstanceOf(ProcessError);
	});

	it("returns no-agent for an empty workspace list", async () => {
		const { exec, calls } = fakeExec({ workspaces: [] });
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
		expect(calls).toEqual(["herdr.workspace.list"]);
	});

	it("returns no-agent when the Ticket pane has no agent", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			panes: [{ workspace_id: "w1", pane_id: "w1:p2", label: "alpha--st-1" }],
			agents: [],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
	});

	it("returns the agent joined to the Ticket pane", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			panes: [{ workspace_id: "w1", pane_id: "w1:p2", label: "alpha--st-1" }],
			agents: [{ workspace_id: "w1", pane_id: "w1:p2", agent_status: "working" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({
			kind: "agent", paneId: "w1:p2", agentStatus: "working",
		});
	});

	it("uses unknown when the matched agent has no status", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			panes: [{ workspace_id: "w1", pane_id: "w1:p2", label: "alpha--st-1" }],
			agents: [{ workspace_id: "w1", pane_id: "w1:p2" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({
			kind: "agent", paneId: "w1:p2", agentStatus: "unknown",
		});
	});

	it("matches workspace and pane labels case-sensitively", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "Alpha" }],
			panes: [{ workspace_id: "w1", pane_id: "w1:p2", label: "alpha--st-1" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({ kind: "no-agent" });
	});

	it("rejects when two workspaces share the Project label", async () => {
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

	it("rejects when two panes share the Ticket label", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			panes: [
				{ workspace_id: "w1", pane_id: "w1:p1", label: "alpha--st-1" },
				{ workspace_id: "w1", pane_id: "w1:p2", label: "alpha--st-1" },
			],
		});
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Ticket 'st-1' has multiple Herdr panes.",
		);
	});

	it("ignores duplicate panes belonging to another Ticket", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			panes: [
				{ workspace_id: "w1", pane_id: "w1:p1", label: "alpha--st-1" },
				{ workspace_id: "w1", pane_id: "w1:p2", label: "alpha--st-2" },
				{ workspace_id: "w1", pane_id: "w1:p3", label: "alpha--st-2" },
			],
			agents: [{ workspace_id: "w1", pane_id: "w1:p1", agent_status: "working" }],
		});
		expect(await findHerdrAgent(TARGET, exec)).toEqual({
			kind: "agent", paneId: "w1:p1", agentStatus: "working",
		});
	});

	it("rejects when the Ticket pane has multiple agents", async () => {
		const { exec } = fakeExec({
			workspaces: [{ workspace_id: "w1", label: "alpha" }],
			panes: [{ workspace_id: "w1", pane_id: "w1:p1", label: "alpha--st-1" }],
			agents: [
				{ workspace_id: "w1", pane_id: "w1:p1", agent_status: "working" },
				{ workspace_id: "w1", pane_id: "w1:p1", agent_status: "idle" },
			],
		});
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Herdr pane 'w1:p1' has multiple agents.",
		);
	});

	it("propagates malformed JSON", async () => {
		const { exec } = fakeExec({ workspaceListRaw: "not json" });
		await expect(findHerdrAgent(TARGET, exec)).rejects.toThrow(
			"Could not parse JSON output from 'herdr.workspace.list'.",
		);
	});
});

describe("stopHerdrAgent", () => {
	it("invokes the stop action with the pane id", async () => {
		const calls: [string, unknown][] = [];
		const exec: HerdrExecFn = async (key, values) => { calls.push([key, values]); return ""; };
		await stopHerdrAgent("w1:p2", exec);
		expect(calls).toEqual([["herdr.agent.stop", { paneId: "w1:p2" }]]);
	});

	it("propagates exec failure", async () => {
		const exec: HerdrExecFn = async () => { throw new Error("close failed"); };
		await expect(stopHerdrAgent("w1:p2", exec)).rejects.toThrow("close failed");
	});
});
