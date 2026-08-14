import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProject, gotoProject, setupE2E, uniqueSlug } from "./fixtures.js";
import { testId, waitLocatorVisible, waitVisible } from "./locators.js";

const fakeHerdr = fileURLToPath(new URL("./fake-herdr.mjs", import.meta.url));
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-e2e-fake-herdr-"));
const statePath = path.join(stateDir, "herdr-state.json");
fs.writeFileSync(
	statePath,
	JSON.stringify({ workspaces: [], panes: [], agents: [], delivered: [] }),
);

const fake = (args: string) => `node "${fakeHerdr}" ${args}`;

interface DeliveredPrompt {
	paneId: string;
	prompt: string;
}

function deliveredPrompts(): DeliveredPrompt[] {
	return JSON.parse(fs.readFileSync(statePath, "utf8")).delivered as DeliveredPrompt[];
}

describe("Review Prompt delivery (e2e, real server)", () => {
	const ctx = setupE2E({
		serverOpts: {
			env: { CONTEXT_FAKE_HERDR_STATE: statePath },
			commandTemplates: {
				"herdr.workspace.list": fake("workspace list"),
				"herdr.pane.list": fake("pane list --workspace {{workspaceId}}"),
				"herdr.agent.list": fake("agent list"),
				"herdr.agent.stop": fake("pane close {{paneId}}"),
				"herdr.review-prompt.deliver": fake("agent prompt {{paneId}} {{prompt}}"),
			},
		},
	});

	/**
	 * The app reaches the queue through timers: the Herdr status poll drives every
	 * delivery, and the Diff Review rereads the queue on its own interval. The page
	 * clock is driven forward between attempts so those timers fire, and the value
	 * they produce is read back by a retrying assertion instead of a real wait.
	 */
	function pollWithClock<T>(read: () => Promise<T>) {
		return expect.poll(async () => {
			await ctx.page.clock.fastForward(2_000);
			return read();
		}, { timeout: 10_000, interval: 150 });
	}

	it("delivers a queued Review Prompt, shows it running, and clears it when the agent is free", async () => {
		await ctx.page.clock.install();
		const folderName = "t-1-deliver-prompt";
		const projectSlug = uniqueSlug("review-delivery");
		const project = await createProject(ctx.testServer, {
			projectSlug,
			withTickets: [{
				number: "T-1",
				title: "Deliver prompt",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		fs.writeFileSync(path.join(worktreePath, "example.ts"), "export const value = 1;\n");

		const agentName = `${project.projectSlug}--${folderName}`;
		fs.writeFileSync(statePath, JSON.stringify({
			workspaces: [{ workspace_id: "ws-1", label: project.projectSlug }],
			panes: [{ workspace_id: "ws-1", pane_id: "pane-1", label: agentName }],
			agents: [{
				workspace_id: "ws-1",
				pane_id: "pane-1",
				name: agentName,
				cwd: worktreePath,
				agent_status: "idle",
			}],
			delivered: [],
		}, null, 2));

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		const card = ctx.page.locator(
			`[data-testid="kanban-board-ticket-card"][data-folder-name="${folderName}"]`,
		);
		await testId(card, "kanban-board-ticket-menu-trigger").click();
		const reviewAction = ctx.page.locator(
			'[data-testid="kanban-board-ticket-menu-review-changes"]',
		);
		await reviewAction.waitFor({ state: "attached", timeout: 10_000 });
		await reviewAction.click();
		await waitVisible(ctx.page, "diff-review");

		// The Herdr agent statuses load only after the deferred polls start, and
		// the page clock keeps those timers frozen. Advance it once so the page
		// knows the Ticket's Agent before the prompt is sent: Send starts an Agent
		// on its own only when none is known, and the one here already runs.
		await ctx.page.clock.fastForward(2_000);
		await expect.poll(
			() => testId(ctx.page, "diff-review-agent-status").textContent(),
			{ timeout: 10_000 },
		).toBe("idle");

		await testId(ctx.page, "diff-review-prompt-agent").click();
		const composer = await waitVisible(ctx.page, "diff-review-composer");
		const statusIcon = testId(composer, "herdr-status-icon");
		await waitLocatorVisible(statusIcon);
		expect(await statusIcon.getAttribute("data-herdr-status")).toBe("idle");
		expect(await testId(ctx.page, "diff-review-profile-select").isDisabled())
			.toBe(true);
		await testId(ctx.page, "diff-review-composer-input")
			.fill("Explain this value.");
		await testId(ctx.page, "diff-review-composer-send").click();
		await expect.poll(
			() => testId(ctx.page, "diff-review-queue-item").count(),
			{ timeout: 10_000 },
		).toBe(1);
		expect(deliveredPrompts()).toEqual([]);

		// The next Herdr status read delivers the prompt, and the agent starts
		// working on it, so it stays at the head of the queue while busy.
		await pollWithClock(async () => deliveredPrompts().length).toBe(1);
		expect(await testId(ctx.page, "diff-review-queue-item").count()).toBe(1);
		expect(await testId(ctx.page, "diff-review-queue-retry").count()).toBe(0);

		const delivered = deliveredPrompts();
		expect(delivered).toHaveLength(1);
		expect(delivered[0].paneId).toBe("pane-1");
		expect(delivered[0].prompt).toContain("Explain this value.");

		const herdrState = JSON.parse(fs.readFileSync(statePath, "utf8"));
		herdrState.agents[0].agent_status = "idle";
		fs.writeFileSync(statePath, JSON.stringify(herdrState, null, 2));

		// The next Herdr status read was taken after the delivery and reports the
		// agent free, so the queue lets the Review Prompt go.
		await pollWithClock(() => testId(ctx.page, "diff-review-queue-item").count()).toBe(0);
	});
});
