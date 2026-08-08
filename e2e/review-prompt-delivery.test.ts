import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProject, gotoProject, poll, setupE2E, uniqueSlug } from "./fixtures.js";
import { testId } from "./locators.js";

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
				"herdr.review-prompt.deliver": fake("pane run {{paneId}} {{prompt}}"),
			},
		},
	});

	it("delivers a queued Review Prompt to the ticket's idle agent", async () => {
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
		await testId(ctx.page, "diff-review")
			.waitFor({ state: "visible", timeout: 15_000 });

		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="example.ts"]',
		).click();
		const addedLine = ctx.page.locator(
			'[data-testid="diff-review-file-diff"] [data-line][data-line-type="change-addition"]',
		).first();
		await addedLine.waitFor({ state: "visible", timeout: 15_000 });
		await addedLine.click();
		await testId(ctx.page, "diff-review-composer-input")
			.fill("Explain this value.");
		await testId(ctx.page, "diff-review-composer-send").click();
		await expect.poll(
			() => testId(ctx.page, "diff-review-queue-item").count(),
			{ timeout: 10_000 },
		).toBe(1);
		expect(deliveredPrompts()).toEqual([]);

		// The queue is driven by the Herdr agent status poll, so the prompt only
		// reaches the agent once that poll runs.
		await ctx.page.clock.fastForward(5_000);
		const delivered = await poll(
			() => deliveredPrompts(),
			(prompts) => prompts.length > 0,
			15_000,
			200,
		);
		expect(delivered).toHaveLength(1);
		expect(delivered[0].paneId).toBe("pane-1");
		expect(delivered[0].prompt).toContain("Explain this value.");
		expect(delivered[0].prompt).toContain("example.ts");

		await expect.poll(
			() => testId(ctx.page, "diff-review-queue-item").count(),
			{ timeout: 15_000 },
		).toBe(0);
	});
});
