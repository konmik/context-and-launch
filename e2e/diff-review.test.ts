import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Locator, Page } from "playwright";
import {
	gotoProject,
	openTicketDetail,
	poll,
	readProjectLauncherConfig,
	seedProject,
	setupE2E,
	uniqueSlug,
} from "./fixtures.js";
import { testId, waitLocatorVisible } from "./locators.js";

// Selecting a Diff Scope starts a Git calculation on the server. The Diff Review
// renders no files until that scope is loaded, so waiting for the file tree to
// report the selected scope waits for the calculation itself, not for a delay.
async function selectScope(page: Page, scope: string): Promise<void> {
	await page.locator('[data-testid="diff-review-scope"]').selectOption(scope);
	await waitForScope(page, scope);
}

async function waitForScope(page: Page, scope: string): Promise<void> {
	await page.locator(
		`[data-testid="diff-review-file-tree"][data-loaded-scope="${scope}"],`
		+ ` [data-testid="diff-review-empty"][data-loaded-scope="${scope}"]`,
	).waitFor({ state: "attached", timeout: 10_000 });
}

async function openCardReview(page: Page, folderName: string): Promise<void> {
	const card = page.locator(
		`[data-testid="kanban-board-ticket-card"][data-folder-name="${folderName}"]`,
	);
	await testId(card, "kanban-board-ticket-menu-trigger").click();
	const action = testId(page, "kanban-board-ticket-menu-review-changes");
	await action.waitFor({ state: "attached", timeout: 10_000 });
	await action.click();
	await testId(page, "diff-review").waitFor({
		state: "visible",
		timeout: 10_000,
	});
}

function reviewFileDiff(page: Page, filePath: string): Locator {
	return page.locator(
		`[data-testid="diff-review-file-diff"][data-file-path="${filePath}"]`,
	);
}

describe("Diff Review (e2e, real server)", () => {
	const ctx = setupE2E();

	it("reviews a worktree change and preserves a queued prompt snapshot", async () => {
		const folderName = "t-1-review-worktree";
		const project = await seedProject(ctx, {
			slugBase: "diff-review",
			appLauncherConfig: { profiles: [] },
			withTickets: [{
				number: "T-1",
				title: "Review worktree",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "src", "example.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\nexport const stable = true;\n");
		fs.writeFileSync(path.join(worktreePath, "asset.bin"), Buffer.from([0, 1, 2, 3]));

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await waitForScope(ctx.page, "working");

		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-scope"] option').count(),
		).toBe(2);
		expect(await ctx.page.locator('[data-testid="diff-review-scope"]').inputValue())
			.toBe("working");
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-file-tree"]'));
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(2);
		const sourceDirectory = ctx.page.locator(
			'[data-testid="diff-review-directory"][data-directory-path="src"]',
		);
		expect(await sourceDirectory.getAttribute("aria-expanded")).toBe("true");
		await sourceDirectory.click();
		expect(await sourceDirectory.getAttribute("aria-expanded")).toBe("false");
		expect(await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).count()).toBe(0);
		await sourceDirectory.click();
		expect(await ctx.page.locator('[data-testid="diff-review-file-section"]').count()).toBe(2);
		expect(await reviewFileDiff(ctx.page, "src/example.ts").count()).toBe(1);
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-scroll"]'));
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-binary"]'));

		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();
		await waitLocatorVisible(reviewFileDiff(ctx.page, "src/example.ts"));
		await expect.poll(
			() => ctx.page.locator(
				'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
			).getAttribute("class"),
		).toContain("bg-accent");

		await ctx.page.locator('[data-testid="diff-review-pace-step"]').click();
		expect(await ctx.page.locator('[data-testid="diff-review-pace-step"]')
			.getAttribute("aria-pressed")).toBe("true");
		await ctx.page.locator('[data-testid="diff-review-refresh"]').click();
		await ctx.page.locator('[data-testid="diff-review-pace-live"]').click();

		const wrapLines = ctx.page.locator('[data-testid="diff-review-wrap-lines"]');
		expect(await wrapLines.getAttribute("aria-pressed")).toBe("false");
		await wrapLines.click();
		expect(await wrapLines.getAttribute("aria-pressed")).toBe("true");
		await waitLocatorVisible(reviewFileDiff(ctx.page, "src/example.ts"));
		await wrapLines.click();
		expect(await wrapLines.getAttribute("aria-pressed")).toBe("false");

		await selectScope(ctx.page, "last-commit");
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-empty"]'));
		await selectScope(ctx.page, "working");
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();

		const addedLine = reviewFileDiff(ctx.page, "src/example.ts").locator(
			'[data-line][data-line-type="change-addition"]',
		).first();
		await addedLine.waitFor({ state: "visible", timeout: 10_000 });
		await addedLine.click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		const composerInput = ctx.page.locator('[data-testid="diff-review-composer-input"]');
		expect(await composerInput.evaluate((element) => document.activeElement === element)).toBe(true);

		fs.writeFileSync(sourcePath, "export const value = 2;\nexport const stable = true;\n");
		await ctx.page.waitForTimeout(1_300);
		await waitLocatorVisible(
			ctx.page.locator('[data-testid="diff-review-stale-warning"]'),
		);
		await composerInput.fill("Please explain why this value changed.");
		await ctx.page.locator('[data-testid="diff-review-composer-send"]').click();

		await waitLocatorVisible(ctx.page.locator(
			'[data-testid="diff-review-composer"] [data-testid="diff-review-queue"]',
		));
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-queue-item"]').count(),
		).toBe(1);
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-queue-item"]').allTextContents(),
		).toEqual([expect.stringContaining("Please explain why this value changed.")]);
		expect(await composerInput.inputValue()).toBe("");
		await ctx.page.locator('[data-testid="diff-review-queue-remove"]').click();
		await ctx.page.locator('[data-testid="diff-review-queue"]')
			.waitFor({ state: "detached", timeout: 10_000 });

		await ctx.page.locator(
			'[data-testid="diff-review-composer"] [aria-label="Close Review Prompt composer"]',
		).click();
		await ctx.page.locator('[data-testid="diff-review-composer"]')
			.waitFor({ state: "detached", timeout: 10_000 });

		await ctx.page.locator('[data-testid="diff-review-close"]').dispatchEvent("click");
		await ctx.page.locator('[data-testid="diff-review"]')
			.waitFor({ state: "detached", timeout: 10_000 });
		await openTicketDetail(ctx.page, folderName);
		await ctx.page.locator('[data-testid="ticket-detail-shortcuts-menu-trigger"]').click();
		await ctx.page.locator('[data-testid="ticket-detail-review-changes-menu-item"]')
			.waitFor({ state: "attached", timeout: 10_000 });
	});

	it("resizes the changed-files sidebar by dragging and scrolls long paths sideways", async () => {
		const folderName = uniqueSlug("tree-resize");
		const longPath = "src/long-directory-name-abcdefghijklmnopqrstuvwxyz-0123456789/"
			+ "very-long-file-name-that-overflows-the-tree-panel-after-resize-"
			+ "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.patch.ts";
		const project = await seedProject(ctx, {
			slugBase: "diff-review",
			appLauncherConfig: { profiles: [] },
			withTickets: [{
				number: "T-1",
				title: "Resizable changed files panel",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, longPath);
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await waitForScope(ctx.page, "working");
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(1);

		const tree = ctx.page.locator('[data-testid="diff-review-file-tree"]');
		const treeScroll = ctx.page.locator('[data-testid="diff-review-file-tree-scroll"]');
		const resize = ctx.page.locator('[data-testid="diff-review-tree-resize"]');
		const initialWidth = await tree.evaluate((node) => node.getBoundingClientRect().width);
		const handleBox = await resize.boundingBox();
		expect(handleBox).not.toBeNull();
		const centerY = handleBox!.y + handleBox!.height / 2;
		await ctx.page.mouse.move(handleBox!.x + handleBox!.width / 2, centerY);
		await ctx.page.mouse.down();
		await ctx.page.mouse.move(handleBox!.x + 140, centerY, { steps: 10 });
		await ctx.page.mouse.up();
		await expect.poll(
			() => tree.evaluate((node) => node.getBoundingClientRect().width),
		).toBeGreaterThan(initialWidth + 100);

		const longRow = ctx.page.locator(
			`[data-testid="diff-review-file"][data-file-path="${longPath}"]`,
		);
		await waitLocatorVisible(longRow);
		await expect.poll(
			() => treeScroll.evaluate((node) => node.scrollWidth > node.clientWidth),
		).toBe(true);
		await treeScroll.evaluate((node) => { node.scrollLeft = 40; });
		expect(await treeScroll.evaluate((node) => node.scrollLeft)).toBe(40);
	});

	it("keeps a typed Review Prompt when its file leaves the diff", async () => {
		await ctx.page.clock.install();
		const folderName = "t-7-vanishing-file";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-vanish",
			withTickets: [{
				number: "T-7",
				title: "Vanishing file",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const goingPath = path.join(worktreePath, "src", "going.ts");
		fs.mkdirSync(path.dirname(goingPath), { recursive: true });
		fs.writeFileSync(goingPath, "export const going = 1;\n");
		fs.writeFileSync(path.join(worktreePath, "src", "staying.ts"), "export const stays = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await waitForScope(ctx.page, "working");
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/going.ts"]',
		).click();
		const addedLine = reviewFileDiff(ctx.page, "src/going.ts")
			.locator('[data-line][data-line-type="change-addition"]')
			.first();
		await addedLine.waitFor({ state: "visible", timeout: 10_000 });
		await addedLine.click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		const composerInput = ctx.page.locator('[data-testid="diff-review-composer-input"]');
		await composerInput.fill("Explain why this line exists.");

		fs.rmSync(goingPath);
		await ctx.page.clock.fastForward(1_300);
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(1);

		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		expect(await composerInput.inputValue()).toBe("Explain why this line exists.");
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-stale-warning"]'));
	});

	// Dispatching dragstart leaves Playwright's Chromium input handling in a drag state, so this
	// assertion has to be the last interaction of its own test.
	it("carries the full Review Prompt as drag-out text", async () => {
		await ctx.page.clock.install();
		const folderName = "t-6-drag-prompt";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-drag",
			withTickets: [{
				number: "T-6",
				title: "Drag prompt",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "src", "example.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();
		const addedLine = reviewFileDiff(ctx.page, "src/example.ts")
			.locator('[data-line][data-line-type="change-addition"]')
			.first();
		await addedLine.waitFor({ state: "visible", timeout: 10_000 });
		await addedLine.click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
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

		const rowDrop = await reviewFileDiff(ctx.page, "src/example.ts")
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
	});

	it("copies the complete Review Prompt with Ctrl/Cmd+Alt+C", async () => {
		const folderName = "t-8-copy-shortcut";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-copy",
			appLauncherConfig: { profiles: [] },
			withTickets: [{
				number: "T-8",
				title: "Copy shortcut",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "src", "example.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="src/example.ts"]',
		).click();
		const addedLine = reviewFileDiff(ctx.page, "src/example.ts")
			.locator('[data-line][data-line-type="change-addition"]')
			.first();
		await addedLine.waitFor({ state: "visible", timeout: 10_000 });
		await addedLine.click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		const composerInput = ctx.page.locator('[data-testid="diff-review-composer-input"]');
		await composerInput.fill("Explain this value.");

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
		await ctx.page.keyboard.press("ControlOrMeta+Alt+c");
		const copiedPrompts = await ctx.page.evaluate(() => {
			const copied = Reflect.get(window, "__copiedPrompts");
			return Array.isArray(copied) ? copied.map(String) : [];
		});
		expect(copiedPrompts).toHaveLength(1);
		expect(copiedPrompts[0]).toContain("Review Prompt");
		expect(copiedPrompts[0]).toContain("File: src/example.ts");
		expect(copiedPrompts[0]).toContain("New lines: 1");
		expect(copiedPrompts[0]).toContain("Feedback:\nExplain this value.");
		expect(copiedPrompts[0]).toContain("Selected diff:");
		expect(copiedPrompts[0]).toContain("export const value = 1;");
	});

	it("copies the plain feedback with Ctrl/Cmd+Alt+C when no lines are selected", async () => {
		const folderName = "t-9-copy-plain";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-copy-plain",
			appLauncherConfig: { profiles: [] },
			withTickets: [{
				number: "T-9",
				title: "Copy plain",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "src", "example.ts");
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export const value = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator('[data-testid="diff-review-prompt-agent"]').click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		const composerInput = ctx.page.locator('[data-testid="diff-review-composer-input"]');
		await composerInput.fill("Run the tests.");

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
		await ctx.page.keyboard.press("ControlOrMeta+Alt+c");
		const copiedPrompts = await ctx.page.evaluate(() => {
			const copied = Reflect.get(window, "__copiedPrompts");
			return Array.isArray(copied) ? copied.map(String) : [];
		});
		expect(copiedPrompts).toEqual(["Run the tests."]);
	});

	it("keeps a dragged text selection alive across Live Review refreshes", async () => {
		await ctx.page.clock.install();
		const folderName = "t-3-live-selection";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-live",
			withTickets: [{
				number: "T-3",
				title: "Live selection",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
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

		const addedLines = reviewFileDiff(ctx.page, "many.ts").locator(
			'[data-line][data-line-type="change-addition"]',
		);
		await expect.poll(() => addedLines.count(), { timeout: 10_000 }).toBe(4);

		await reviewFileDiff(ctx.page, "many.ts").evaluate((host) => {
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
	});

	it("queues a prompt with no Review Selection and holds the file list still", async () => {
		await ctx.page.clock.install();
		const folderName = "t-5-direct-prompt";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-direct",
			appLauncherConfig: { profiles: [] },
			withTickets: [{
				number: "T-5",
				title: "Direct prompt",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
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
			{ timeout: 10_000 },
		).toBe(40);

		const treeScroll = ctx.page.locator('[data-testid="diff-review-file-tree-scroll"]');
		await treeScroll.evaluate((node) => { node.scrollTop = 200; });
		const inView = await treeScroll.evaluate((node) => {
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
		expect(await treeScroll.evaluate((node) => node.scrollTop)).toBe(200);

		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-agent-status"]'));
		await ctx.page.locator('[data-testid="diff-review-prompt-agent"]').click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		expect(await ctx.page.locator('[data-testid="diff-review-stale-warning"]').count())
			.toBe(0);
		await ctx.page.locator('[data-testid="diff-review-composer-input"]')
			.fill("Rerun the tests.");
		await ctx.page.locator('[data-testid="diff-review-composer-send"]').click();
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-queue-item"]').allTextContents(),
			{ timeout: 10_000 },
		).toEqual([expect.stringContaining("Agent prompt")]);
	});

	it("keeps Review State for lines that did not change when the file changes", async () => {
		await ctx.page.clock.install();
		const folderName = "t-4-review-state";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-state",
			mainBranch: "main",
			withTickets: [{
				number: "T-4",
				title: "Review state",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		const sourcePath = path.join(worktreePath, "long.ts");
		const lines = Array.from({ length: 200 }, (_, index) => `export const v${index} = ${index};`);
		fs.writeFileSync(sourcePath, lines.join("\n") + "\n");
		execSync("git add long.ts", { cwd: worktreePath });
		execSync('git commit -m "agent work"', { cwd: worktreePath });

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator('[data-testid="diff-review-file"][data-file-path="long.ts"]').click();
		const rows = reviewFileDiff(ctx.page, "long.ts").locator(
			'[data-line][data-line-type="change-addition"]',
		);
		await expect.poll(() => rows.count(), { timeout: 10_000 }).toBe(200);

		const fileIcon = ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="long.ts"] [aria-label]',
		).first();
		await ctx.page.mouse.move(700, 400);
		for (let step = 0; step < 60; step++) await ctx.page.mouse.wheel(0, 300);
		await expect.poll(() => fileIcon.getAttribute("aria-label"), { timeout: 10_000 })
			.toBe("Reviewed");

		lines[100] = "export const v100 = 4200; // agent edit";
		fs.writeFileSync(sourcePath, lines.join("\n") + "\n");
		await ctx.page.clock.fastForward(1_300);
		await expect.poll(() => fileIcon.getAttribute("aria-label"), { timeout: 10_000 })
			.toBe("Not reviewed");

		const nextChange = ctx.page.locator('[data-testid="diff-review-next-change"]');
		await expect.poll(() => nextChange.isDisabled()).toBe(false);
		await nextChange.click();
		await expect.poll(() => fileIcon.getAttribute("aria-label"), { timeout: 10_000 })
			.toBe("Reviewed");
	});

	it("opens on All Changes, covering committed and uncommitted work", async () => {
		await ctx.page.clock.install();
		const folderName = "t-2-review-branch";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-branch",
			mainBranch: "main",
			withTickets: [{
				number: "T-2",
				title: "Review branch",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		fs.writeFileSync(path.join(worktreePath, "committed.ts"), "export const done = 1;\n");
		execSync("git add committed.ts", { cwd: worktreePath });
		execSync('git commit -m "agent work"', { cwd: worktreePath });
		fs.writeFileSync(path.join(worktreePath, "pending.ts"), "export const wip = 2;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await waitForScope(ctx.page, "all");

		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-scope"] option').count(),
		).toBe(4);
		expect(await ctx.page.locator('[data-testid="diff-review-scope"]').inputValue())
			.toBe("all");
		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-file"]').count(),
		).toBe(2);
		expect(await ctx.page.locator('[data-testid="diff-review-file-section"]')
			.evaluateAll((sections) => sections.map((section) =>
				(section as HTMLElement).dataset.filePath))).toEqual([
			"committed.ts",
			"pending.ts",
		]);
		expect(await ctx.page.locator('[data-testid="diff-review-file-diff"]').count()).toBe(2);
		expect(await ctx.page.locator('[data-testid="diff-review-file-diff"]')
			.evaluateAll((diffs) => diffs.map((diff) => {
				const element = diff as HTMLElement;
				return !element.hidden && getComputedStyle(element).display !== "none";
			}))).toEqual([true, true]);
		expect(await ctx.page.locator('[data-testid="diff-review-file-diff"]')
			.evaluateAll((diffs) => diffs.map((diff) =>
				diff.querySelectorAll("[data-line]").length))).toEqual([
			expect.any(Number),
			expect.any(Number),
		]);
		for (const filePath of ["committed.ts", "pending.ts"]) {
			expect(await reviewFileDiff(ctx.page, filePath).locator("[data-line]").count())
				.toBeGreaterThan(0);
		}
		const simultaneousSections = await ctx.page.locator(
			'[data-testid="diff-review-file-section"]',
		).evaluateAll((sections) => {
			const scroll = document.querySelector('[data-testid="diff-review-scroll"]')!
				.getBoundingClientRect();
			return sections.filter((section) => {
				const box = section.getBoundingClientRect();
				return box.bottom > scroll.top && box.top < scroll.bottom;
			}).length;
		});
		expect(simultaneousSections).toBe(2);
		const sectionBoxes = await ctx.page.locator(
			'[data-testid="diff-review-file-section"]',
		).evaluateAll((sections) => sections.map((section) => {
			const box = section.getBoundingClientRect();
			return { top: box.top, bottom: box.bottom, height: box.height };
		}));
		expect(sectionBoxes[0].height).toBeGreaterThan(50);
		expect(sectionBoxes[1].height).toBeGreaterThan(50);
		expect(sectionBoxes[1].top).toBeGreaterThanOrEqual(sectionBoxes[0].bottom);
		const typeTotals = await ctx.page.locator(
			'[data-testid="diff-review-file-type-totals"]',
		).textContent();
		expect(typeTotals).toContain(".ts");
		expect(typeTotals).toContain("+2");
		expect(typeTotals).toContain("-0");

		await selectScope(ctx.page, "working");
		expect(await ctx.page.locator('[data-testid="diff-review-file"]').allTextContents())
			.toEqual([expect.stringContaining("pending.ts")]);

		await selectScope(ctx.page, "branch");
		expect(await ctx.page.locator('[data-testid="diff-review-file"]').allTextContents())
			.toEqual([expect.stringContaining("committed.ts")]);

		await selectScope(ctx.page, "all");
		expect(await ctx.page.locator('[data-testid="diff-review-file"]').count()).toBe(2);
	});

	it("offers the other Diff Scopes when the opening one cannot be calculated", async () => {
		const folderName = "t-8-missing-main";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-missing-main",
			mainBranch: "nonexistent-main",
			withTickets: [{
				number: "T-8",
				title: "Missing main",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		fs.writeFileSync(path.join(worktreePath, "pending.ts"), "export const wip = 2;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);

		await expect.poll(
			() => ctx.page.locator('[data-testid="diff-review-scope"] option').count(),
			{ timeout: 10_000 },
		).toBe(4);
		await expect.poll(
			() => ctx.page.locator('[role="alert"]').first().textContent(),
			{ timeout: 10_000 },
		).toContain("nonexistent-main");

		await selectScope(ctx.page, "working");
		expect(await ctx.page.locator('[data-testid="diff-review-file"]').allTextContents())
			.toEqual([expect.stringContaining("pending.ts")]);
	});

	it("selects the Agent profile from the Review Prompt composer", async () => {
		const folderName = "t-7-launch-agent";
		const project = await seedProject(ctx, {
			slugBase: "diff-review-launch",
			appLauncherConfig: {
				profiles: [
					{ name: "Claude", command: "" },
					{ name: "GPT", command: "" },
				],
			},
			withTickets: [{
				number: "T-7",
				title: "Launch agent",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const worktreePath = path.join(project.worktreeRootPath!, folderName);
		fs.writeFileSync(path.join(worktreePath, "example.ts"), "export const value = 1;\n");

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator(
			'[data-testid="diff-review-file"][data-file-path="example.ts"]',
		).click();

		expect(await ctx.page.locator('[data-testid="diff-review-agent-status"]').textContent())
			.toBe("no agent");

		await ctx.page.locator('[data-testid="diff-review-prompt-agent"]').click();
		await waitLocatorVisible(ctx.page.locator('[data-testid="diff-review-composer"]'));
		const statusIcon = ctx.page.locator(
			'[data-testid="diff-review-composer"] [data-testid="herdr-status-icon"]',
		);
		await waitLocatorVisible(statusIcon);
		expect(await statusIcon.getAttribute("data-herdr-status")).toBe("unknown");
		const profileSelect = ctx.page.locator('[data-testid="diff-review-profile-select"]');
		await waitLocatorVisible(profileSelect);
		expect(await profileSelect.isDisabled()).toBe(false);
		expect(await profileSelect.inputValue()).toBe("Claude");
		await profileSelect.selectOption("GPT");
		const config = await poll(
			() => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
			(value) => value?.columnDefaults?.todo?.profileName === "GPT",
			5_000,
		);
		expect(config?.columnDefaults?.todo?.profileName).toBe("GPT");
	});

	it("closes Diff Review when switching projects", async () => {
		const folderName = "t-9-switch-project";
		const first = await seedProject(ctx, {
			slugBase: "diff-review-switch-a",
			withTickets: [{
				number: "T-9",
				title: "Switch project",
				status: "todo",
				folderName,
			}],
			withWorktrees: [{ folderName }],
		});
		const second = await seedProject(ctx, {
			slugBase: "diff-review-switch-b",
		});
		fs.writeFileSync(
			path.join(first.worktreeRootPath!, folderName, "example.ts"),
			"export const value = 1;\n",
		);

		await gotoProject(ctx.page, ctx.testServer, first.projectSlug);
		await openCardReview(ctx.page, folderName);
		await ctx.page.locator('[data-testid="project-header-project-dropdown-trigger"]').click();
		await ctx.page.locator('[data-testid="project-header-project-item"]', {
			hasText: second.projectSlug,
		}).click();

		await ctx.page.waitForURL(`**/project/${second.projectSlug}`);
		await waitLocatorVisible(ctx.page.locator('[data-testid="kanban-board-scroll"]'));
		expect(await ctx.page.getByText("Something went wrong").count()).toBe(0);
	});
});
