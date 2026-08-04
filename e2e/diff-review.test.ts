import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Locator, Page } from "playwright";
import {
	createProject,
	gotoProject,
	openTicketDetail,
	setupE2E,
	uniqueSlug,
} from "./fixtures.js";

async function expectVisible(locator: Locator, timeout = 10_000): Promise<void> {
	await locator.waitFor({ state: "visible", timeout });
	expect(await locator.isVisible()).toBe(true);
}

async function openCardReview(page: Page, folderName: string): Promise<void> {
	const card = page.locator(
		`[data-testid="kanban-board-ticket-card"][data-folder-name="${folderName}"]`,
	);
	await card.locator('[data-testid="kanban-board-ticket-menu-trigger"]').click();
	const action = page.locator('[data-testid="kanban-board-ticket-menu-review-changes"]');
	await action.waitFor({ state: "attached", timeout: 10_000 });
	await action.click();
	await page.locator('[data-testid="diff-review"]').waitFor({
		state: "visible",
		timeout: 15_000,
	});
}

describe("Diff Review (e2e, real server)", () => {
	const ctx = setupE2E();

	it("reviews a worktree change and preserves a queued prompt snapshot", async () => {
		await ctx.page.clock.install();
		const folderName = "t-1-review-worktree";
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug("diff-review"),
			withTickets: [{
				number: "T-1",
				title: "Review worktree",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "src", "example.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\nexport const stable = true;\n");
		fs.writeFileSync(path.join(worktreePath, "asset.bin"), Buffer.from([0, 1, 2, 3]));

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);

		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-scope"] option').count(),
		).toBe(2);
		expect(await ctx.page.locator('[data-testid="diff-review-scope"]').inputValue())
			.toBe("working");
		await expectVisible(ctx.page.locator('[data-testid="diff-review-file-tree"]'));
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(2);
		await expectVisible(ctx.page.locator('[data-testid="diff-review-scroll"]'));
		await expectVisible(ctx.page.locator('[data-testid="diff-review-binary"]'));

		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();
		await expectVisible(ctx.page.locator('[data-testid="diff-review-file-diff"]'));

		await ctx.page.locator('[data-testid="diff-review-pace-step"]').click();
		expect(await ctx.page.locator('[data-testid="diff-review-pace-step"]')
			.getAttribute("aria-pressed")).toBe("true");
		await ctx.page.locator('[data-testid="diff-review-refresh"]').click();
		await ctx.page.locator('[data-testid="diff-review-pace-live"]').click();

		await ctx.page.locator('[data-testid="diff-review-scope"]').selectOption("last-commit");
		await expectVisible(ctx.page.locator('[data-testid="diff-review-empty"]'));
		await ctx.page.locator('[data-testid="diff-review-scope"]').selectOption("working");
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();

		const addedLine = ctx.page.locator(
			'[data-testid="diff-review-file-diff"]'
			+ ' [data-line][data-line-type="change-addition"]',
		).first();
		await addedLine.waitFor({ state: "visible", timeout: 15_000 });
		await addedLine.click();
		await expectVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		const composerInput = ctx.page.locator('[data-testid="diff-review-composer-input"]');
		expect(await composerInput.evaluate((element) => document.activeElement === element)).toBe(true);

		fs.writeFileSync(sourcePath, "export const value = 2;\nexport const stable = true;\n");
		await ctx.page.clock.fastForward(1_300);
		await expectVisible(
			ctx.page.locator('[data-testid="diff-review-stale-warning"]'),
		);
		await composerInput.fill("Please explain why this value changed.");
		await ctx.page.locator('[data-testid="diff-review-composer-send"]').click();

		await expectVisible(ctx.page.locator(
			'[data-testid="diff-review-composer"] [data-testid="diff-review-queue"]',
		));
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-queue-item"]').count(),
		).toBe(1);
		expect(await ctx.page.locator('[data-testid="diff-review-queue-retry"]').count()).toBe(0);
		expect(await composerInput.inputValue()).toBe("");

		await ctx.page.locator(
			'[data-testid="diff-review-composer"] [aria-label="Close Review Prompt composer"]',
		).click();
		await ctx.page.locator('[data-testid="diff-review-queue"]')
			.waitFor({ state: "detached", timeout: 10_000 });

		await ctx.page.locator('[data-testid="diff-review-close"]').click();
		await ctx.page.locator('[data-testid="diff-review"]')
			.waitFor({ state: "detached", timeout: 10_000 });
		await openTicketDetail(ctx.page, folderName);
		await ctx.page.locator('[data-testid="ticket-detail-shortcuts-menu-trigger"]').click();
		await ctx.page.locator('[data-testid="ticket-detail-review-changes-menu-item"]')
			.waitFor({ state: "attached", timeout: 10_000 });
	}, 60_000);

	// Dispatching dragstart leaves Playwright's Chromium input handling in a drag state, so this
	// assertion has to be the last interaction of its own test.
	it("carries the full Review Prompt as drag-out text", async () => {
		await ctx.page.clock.install();
		const folderName = "t-6-drag-prompt";
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug("diff-review-drag"),
			withTickets: [{
				number: "T-6",
				title: "Drag prompt",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "src", "example.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();
		const addedLine = ctx.page.locator(
			'[data-testid="diff-review-file-diff"] [data-line][data-line-type="change-addition"]',
		).first();
		await addedLine.waitFor({ state: "visible", timeout: 15_000 });
		await addedLine.click();
		await expectVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		await ctx.page.locator('[data-testid="diff-review-composer-input"]')
			.fill("Explain this value.");

		await ctx.page.evaluate(() => {
			const copied: string[] = [];
			Reflect.set(window, "__copiedPrompts", copied);
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: {
					writeText: (text: string) => {
						copied.push(text);
						return Promise.resolve();
					},
				},
			});
		});
		await ctx.page.locator('[data-testid="diff-review-drag-prompt"]').click();
		const copiedPrompts = await ctx.page.evaluate(() => {
			const copied = Reflect.get(window, "__copiedPrompts");
			return Array.isArray(copied) ? copied.map(String) : [];
		});
		expect(copiedPrompts).toHaveLength(1);

		const drop = await ctx.page.locator('[data-testid="diff-review-drag-prompt"]')
			.evaluate((node) => {
				const transfer = new DataTransfer();
				transfer.setData("text/html", "<b>raw diff markup</b>");
				node.dispatchEvent(new DragEvent("dragstart", { dataTransfer: transfer }));
				return {
					text: transfer.getData("text/plain"),
					html: transfer.getData("text/html"),
				};
			});
		const dropText = drop.text;
		expect(drop.html).toBe("");
		expect(dropText).toBe(copiedPrompts[0]);
		expect(dropText).toContain("Review Prompt");
		expect(dropText).toContain("File: src/example.ts");
		expect(dropText).toContain("New lines: 1");
		expect(dropText).toContain("Feedback:\nExplain this value.");
		expect(dropText).toContain("Selected diff:");
		expect(dropText).toContain("export const value = 1;");

		const rowDrop = await ctx.page.locator('[data-testid="diff-review-file-diff"]')
			.evaluate((host) => {
				const root = (host.firstElementChild as HTMLElement).shadowRoot!;
				const row = root.querySelector<HTMLElement>(
					'[data-line][data-line-type="change-addition"]',
				)!;
				const transfer = new DataTransfer();
				transfer.setData("text/plain", "export const value = 1;");
				transfer.setData("text/html", "<span>export const value = 1;</span>");
				row.dispatchEvent(new DragEvent("dragstart", {
					dataTransfer: transfer,
					bubbles: true,
					composed: true,
				}));
				return {
					text: transfer.getData("text/plain"),
					html: transfer.getData("text/html"),
				};
			});
		expect(rowDrop.html).toBe("");
		expect(rowDrop.text).toBe(dropText);
	}, 60_000);

	it("keeps a dragged text selection alive across Live Review refreshes", async () => {
		await ctx.page.clock.install();
		const folderName = "t-3-live-selection";
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug("diff-review-live"),
			withTickets: [{
				number: "T-3",
				title: "Live selection",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "many.ts");
		fs.writeFileSync(
			sourcePath,
			["const one = 1;", "const two = 2;", "const three = 3;", "const four = 4;", ""].join("\n"),
		);
		execSync("git add many.ts", { cwd: worktreePath });
		execSync('git commit -m "baseline"', { cwd: worktreePath });
		fs.writeFileSync(
			sourcePath,
			["const one = 11;", "const two = 22;", "const three = 33;", "const four = 44;", ""]
				.join("\n"),
		);

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator('[data-testid="diff-review-file"][data-file-path="many.ts"]').click();

		const addedLines = ctx.page.locator(
			'[data-testid="diff-review-file-diff"]'
			+ ' [data-line][data-line-type="change-addition"]',
		);
		await expect.poll(() => addedLines.count(), { timeout: 15_000 }).toBe(4);

		await ctx.page.evaluate(() => {
			const host = document.querySelector('[data-testid="diff-review-file-diff"]')!;
			const root = (host.firstElementChild as HTMLElement).shadowRoot!;
			const lines = root.querySelectorAll<HTMLElement>(
				'[data-line][data-line-type="change-addition"]',
			);
			const selection = (root as ShadowRoot & { getSelection?(): Selection | null })
				.getSelection?.() ?? document.getSelection()!;
			const range = document.createRange();
			range.setStart(lines[0], 0);
			range.setEnd(lines[2], lines[2].childNodes.length);
			selection.removeAllRanges();
			selection.addRange(range);
			Reflect.set(window, "__reviewRoot", root);
			Reflect.set(window, "__reviewFirstLine", lines[0]);
		});

		await ctx.page.clock.fastForward(1_500);

		const report = await ctx.page.evaluate(() => {
			const root = Reflect.get(window, "__reviewRoot") as
				ShadowRoot & { getSelection?(): Selection | null };
			const firstLine = Reflect.get(window, "__reviewFirstLine") as HTMLElement;
			const after = root.getSelection?.() ?? document.getSelection()!;
			return {
				stillRendered: firstLine.isConnected,
				stillSelected: !after.isCollapsed,
			};
		});
		expect(report.stillRendered).toBe(true);
		expect(report.stillSelected).toBe(true);
	}, 60_000);

	it("queues a prompt with no Review Selection and holds the file list still", async () => {
		await ctx.page.clock.install();
		const folderName = "t-5-direct-prompt";
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug("diff-review-direct"),
			withTickets: [{
				number: "T-5",
				title: "Direct prompt",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		for (let index = 0; index < 40; index++) {
			fs.writeFileSync(
				path.join(worktreePath, `file-${String(index).padStart(2, "0")}.ts`),
				`export const v${index} = ${index};\n`,
			);
		}

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
			{ timeout: 15_000 },
		).toBe(40);

		const tree = ctx.page.locator('[data-testid="diff-review-file-tree"]');
		await tree.evaluate((node) => { node.scrollTop = 200; });
		const inView = await tree.evaluate((node) => {
			const treeBox = node.getBoundingClientRect();
			const row = [...node.querySelectorAll<HTMLElement>('[data-testid="diff-review-file"]')]
				.find((candidate) => {
					const box = candidate.getBoundingClientRect();
					return box.top >= treeBox.top && box.bottom <= treeBox.bottom;
				});
			return row?.dataset.filePath;
		});
		expect(inView).toBeDefined();
		await ctx.page.locator(
			`[data-testid="diff-review-file"][data-file-path="${inView}"]`,
		).click();
		await ctx.page.clock.fastForward(1_500);
		expect(await tree.evaluate((node) => node.scrollTop)).toBe(200);

		await expectVisible(ctx.page.locator('[data-testid="diff-review-agent-status"]'));
		await ctx.page.locator('[data-testid="diff-review-prompt-agent"]').click();
		await expectVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		expect(await ctx.page.locator('[data-testid="diff-review-stale-warning"]').count())
			.toBe(0);
		await ctx.page.locator('[data-testid="diff-review-composer-input"]')
			.fill("Rerun the tests.");
		await ctx.page.locator('[data-testid="diff-review-composer-send"]').click();
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-queue-item"]').allTextContents(),
			{ timeout: 10_000 },
		).toEqual([expect.stringContaining("Agent prompt")]);
	}, 60_000);

	it("keeps Review State for lines that did not change when the file changes", async () => {
		await ctx.page.clock.install();
		const folderName = "t-4-review-state";
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug("diff-review-state"),
			mainBranch: "main",
			withTickets: [{
				number: "T-4",
				title: "Review state",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "long.ts");
		const lines = Array.from({ length: 200 }, (_, index) => `export const v${index} = ${index};`);
		fs.writeFileSync(sourcePath, lines.join("\n") + "\n");
		execSync("git add long.ts", { cwd: worktreePath });
		execSync('git commit -m "agent work"', { cwd: worktreePath });

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator('[data-testid="diff-review-file"][data-file-path="long.ts"]').click();
		const rows = ctx.page.locator(
			'[data-testid="diff-review-file-diff"] [data-line][data-line-type="change-addition"]',
		);
		await expect.poll(() => rows.count(), { timeout: 20_000 }).toBe(200);

		const fileIcon = ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="long.ts"] [aria-label]',
		).first();
		await ctx.page.mouse.move(700, 400);
		for (let step = 0; step < 60; step++) await ctx.page.mouse.wheel(0, 300);
		await expect.poll(() => fileIcon.getAttribute("aria-label"), { timeout: 15_000 })
			.toBe("Reviewed");

		lines[100] = "export const v100 = 4200; // agent edit";
		fs.writeFileSync(sourcePath, lines.join("\n") + "\n");
		await ctx.page.clock.fastForward(1_300);
		await expect.poll(() => fileIcon.getAttribute("aria-label"), { timeout: 15_000 })
			.toBe("Not reviewed");

		const nextChange = ctx.page.locator('[data-testid="diff-review-next-change"]');
		await expect.poll(() => nextChange.isDisabled()).toBe(false);
		await nextChange.click();
		await expect.poll(() => fileIcon.getAttribute("aria-label"), { timeout: 15_000 })
			.toBe("Reviewed");
	}, 60_000);

	it("opens on All Changes, covering committed and uncommitted work", async () => {
		await ctx.page.clock.install();
		const folderName = "t-2-review-branch";
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug("diff-review-branch"),
			mainBranch: "main",
			withTickets: [{
				number: "T-2",
				title: "Review branch",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		ctx.projects.push(project);
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		fs.writeFileSync(path.join(worktreePath, "committed.ts"), "export const done = 1;\n");
		execSync("git add committed.ts", { cwd: worktreePath });
		execSync('git commit -m "agent work"', { cwd: worktreePath });
		fs.writeFileSync(path.join(worktreePath, "pending.ts"), "export const wip = 2;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);

		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-scope"] option').count(),
		).toBe(4);
		expect(await ctx.page.locator('[data-testid="diff-review-scope"]').inputValue())
			.toBe("all");
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(2);

		const nextChange = ctx.page.locator('[data-testid="diff-review-next-change"]');
		await expectVisible(nextChange);
		await expect.poll(() => nextChange.isDisabled()).toBe(false);
		await nextChange.click();
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"][data-file-path="pending.ts"]')
				.getAttribute("class"),
		).toContain("bg-accent");
		await expect.poll(() => nextChange.isDisabled(), { timeout: 15_000 }).toBe(true);

		await ctx.page.locator('[data-testid="diff-review-scope"]').selectOption("working");
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').allTextContents(),
		).toEqual([expect.stringContaining("pending.ts")]);

		await ctx.page.locator('[data-testid="diff-review-scope"]').selectOption("branch");
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').allTextContents(),
		).toEqual([expect.stringContaining("committed.ts")]);

		await ctx.page.locator('[data-testid="diff-review-scope"]').selectOption("all");
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(2);
	}, 60_000);
});
