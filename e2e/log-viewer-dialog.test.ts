import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page, Route } from "playwright";
import {
	createProject, gotoProject, setupE2E, uniqueSlug,
} from "./fixtures.js";

const LOG_TEXT = "distinctive log viewer e2e entry";
const REFRESH_TEXT = "distinctive refreshed log viewer entry";

function seedLogs(dataDir: string, text: string): void {
	const logDir = path.join(dataDir, "logs");
	fs.mkdirSync(logDir, { recursive: true });
	for (const file of fs.readdirSync(logDir)) {
		if (file.startsWith("app-") && file.endsWith(".log")) {
			fs.unlinkSync(path.join(logDir, file));
		}
	}
	if (text) fs.writeFileSync(path.join(logDir, "app-e2e.log"), text);
}

async function deferNextLogRead(page: Page): Promise<{
	requestUrl: Promise<string>;
	release: () => Promise<void>;
}> {
	let releaseGate!: () => void;
	const released = new Promise<void>((resolve) => { releaseGate = resolve; });
	let resolveHandled!: () => void;
	let rejectHandled!: (error: unknown) => void;
	const handled = new Promise<void>((resolve, reject) => {
		resolveHandled = resolve;
		rejectHandled = reject;
	});
	let observed!: (url: string) => void;
	const requestUrl = new Promise<string>((resolve) => { observed = resolve; });
	let captured = false;
	const handler = async (route: Route) => {
		const serverIdHeader = route.request().headers()["x-server-id"];
		if (!serverIdHeader) {
			await route.fallback();
			return;
		}
		const serverId = decodeURIComponent(serverIdHeader);
		if (captured || !serverId.includes("log-api_ts--getAppLogs")) {
			await route.fallback();
			return;
		}
		captured = true;
		observed(route.request().url());
		try {
			await released;
			const response = await route.fetch();
			await route.fulfill({ response });
			await page.unroute("**/_server*", handler);
			resolveHandled();
		} catch (error) {
			rejectHandled(error);
		}
	};
	await page.route("**/_server*", handler);
	return {
		requestUrl,
		release: async () => {
			releaseGate();
			await handled;
		},
	};
}

async function openLogs(page: Page): Promise<void> {
	await page.click('[data-testid="project-header-logs-button"]');
	await logPanel(page).waitFor({ state: "visible" });
}

async function closeLogs(page: Page): Promise<void> {
	const panel = logPanel(page);
	await panel.getByRole("button", { name: "Close", exact: true }).click();
	await panel.waitFor({ state: "hidden" });
}

function logPanel(page: Page): Locator {
	return page
		.locator('[data-scope="floating-panel"][data-part="content"]')
		.filter({ hasText: "Application Logs" });
}

function loadingStatus(page: Page): Locator {
	return logPanel(page).locator('[data-testid="log-viewer-loading"]');
}

function emptyStatus(page: Page): Locator {
	return logPanel(page).getByText("No logs yet.", { exact: true });
}

async function waitForLoadingStatus(page: Page): Promise<void> {
	await loadingStatus(page).waitFor({ state: "visible" });
}

async function waitForEmptyStatus(page: Page): Promise<void> {
	await waitForPanelText(page, "No logs yet.");
}

async function expectStatusAbsent(status: Locator): Promise<void> {
	await expect.poll(async () => status.count()).toBe(0);
}

async function waitForPanelText(page: Page, text: string): Promise<void> {
	await expect.poll(
		async () => logPanel(page).innerText(),
		{ timeout: 10000 },
	).toContain(text);
}

async function resizeLogPanel(page: Page, delta: { x: number; y: number }): Promise<number> {
	const handle = logPanel(page).locator(
		'[data-part="resize-trigger"][data-axis="se"]',
	);
	const box = await handle.boundingBox();
	if (!box) throw new Error("Log viewer resize handle is not visible");
	const startX = box.x + box.width / 2;
	const startY = box.y + box.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	const startedAt = performance.now();
	await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 20 });
	const elapsedMs = performance.now() - startedAt;
	await page.mouse.up();
	return elapsedMs;
}

describe("Application Logs dialog (e2e, real server)", () => {
	const ctx = setupE2E();

	async function setupProject(prefix: string): Promise<void> {
		const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug(prefix) });
		ctx.projects.push(project);
		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
	}

	it("shows loading while an initial empty read is pending", async () => {
		await setupProject("logs-empty");
		await ctx.page.clock.install();
		seedLogs(ctx.testServer.dataDir, "");
		const deferred = await deferNextLogRead(ctx.page);
		await openLogs(ctx.page);
		await deferred.requestUrl;
		try {
			await waitForLoadingStatus(ctx.page);
			await expectStatusAbsent(emptyStatus(ctx.page));
		} finally {
			seedLogs(ctx.testServer.dataDir, "");
			await deferred.release();
		}
		await waitForEmptyStatus(ctx.page);
		await expectStatusAbsent(loadingStatus(ctx.page));
	}, 60000);

	it("shows content when the initial log read completes", async () => {
		await setupProject("logs-content");
		seedLogs(ctx.testServer.dataDir, LOG_TEXT);
		const deferred = await deferNextLogRead(ctx.page);

		await openLogs(ctx.page);
		await deferred.requestUrl;
		try {
			await waitForLoadingStatus(ctx.page);
		} finally {
			seedLogs(ctx.testServer.dataDir, LOG_TEXT);
			await deferred.release();
		}
		await waitForPanelText(ctx.page, LOG_TEXT);
		await expectStatusAbsent(loadingStatus(ctx.page));
	}, 60000);

	it("retains completed content while a refresh is pending", async () => {
		await setupProject("logs-refresh");
		await ctx.page.clock.install();
		seedLogs(ctx.testServer.dataDir, LOG_TEXT);
		await openLogs(ctx.page);
		await waitForPanelText(ctx.page, LOG_TEXT);
		seedLogs(ctx.testServer.dataDir, "");
		const deferred = await deferNextLogRead(ctx.page);

		await ctx.page.clock.runFor(10000);
		await deferred.requestUrl;
		const refreshPendingText = await logPanel(ctx.page).innerText();
		expect(refreshPendingText).toContain(LOG_TEXT);

		seedLogs(ctx.testServer.dataDir, "");
		await deferred.release();
		await waitForEmptyStatus(ctx.page);
		seedLogs(ctx.testServer.dataDir, REFRESH_TEXT);
		const nextRefresh = await deferNextLogRead(ctx.page);
		await ctx.page.clock.runFor(10000);
		await nextRefresh.requestUrl;
		await waitForEmptyStatus(ctx.page);
		seedLogs(ctx.testServer.dataDir, REFRESH_TEXT);
		await nextRefresh.release();
		await waitForPanelText(ctx.page, REFRESH_TEXT);
	}, 60000);

	it("clear stays loaded-empty and close rejects a late read and stops polling", async () => {
		await setupProject("logs-close");
		await ctx.page.clock.install();
		seedLogs(ctx.testServer.dataDir, LOG_TEXT);
		await openLogs(ctx.page);
		await waitForPanelText(ctx.page, LOG_TEXT);

		await logPanel(ctx.page).getByRole("button", { name: "Clear logs" }).click();
		await waitForEmptyStatus(ctx.page);
		await closeLogs(ctx.page);

		seedLogs(ctx.testServer.dataDir, REFRESH_TEXT);
		const deferred = await deferNextLogRead(ctx.page);
		await openLogs(ctx.page);
		const requestUrl = await deferred.requestUrl;
		await waitForLoadingStatus(ctx.page);
		let laterReads = 0;
		const countReads = (request: { url(): string }) => {
			if (request.url() === requestUrl) laterReads += 1;
		};
		ctx.page.on("request", countReads);
		await closeLogs(ctx.page);
		await deferred.release();
		await ctx.page.clock.runFor(30000);
		ctx.page.off("request", countReads);
		expect(laterReads).toBe(0);
		expect(await logPanel(ctx.page).getByText(REFRESH_TEXT, { exact: true }).count()).toBe(0);
	}, 60000);

	it("clear rejects an in-flight initial read", async () => {
		await setupProject("logs-clear-pending");
		seedLogs(ctx.testServer.dataDir, LOG_TEXT);
		const deferred = await deferNextLogRead(ctx.page);

		await openLogs(ctx.page);
		await deferred.requestUrl;
		await logPanel(ctx.page).getByRole("button", { name: "Clear logs" }).click();
		await waitForEmptyStatus(ctx.page);

		await deferred.release();
		await ctx.page.waitForTimeout(100);
		await waitForEmptyStatus(ctx.page);
		expect(await logPanel(ctx.page).innerText()).not.toContain(LOG_TEXT);
	}, 60000);

	it("keeps resize work bounded with a full log history", async () => {
		await setupProject("logs-resize");
		seedLogs(ctx.testServer.dataDir, "");
		await openLogs(ctx.page);
		await waitForEmptyStatus(ctx.page);
		const emptyResizeMs = await resizeLogPanel(ctx.page, { x: 160, y: 80 });
		await closeLogs(ctx.page);

		const line = "2026-07-24T10:00:00.000Z [app] realistic application log output for resize performance\n";
		seedLogs(ctx.testServer.dataDir, line.repeat(16000));
		await openLogs(ctx.page);
		await waitForPanelText(ctx.page, "realistic application log output");
		const fullResizeMs = await resizeLogPanel(ctx.page, { x: -160, y: -80 });

		expect(fullResizeMs).toBeLessThan(emptyResizeMs * 1.5 + 100);
	}, 60000);
});
