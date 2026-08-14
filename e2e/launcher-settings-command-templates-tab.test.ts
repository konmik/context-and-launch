import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { testId } from "./locators.js";
import {
	createProject, gotoProject, openLauncherSettings, openLauncherSettingsTab,
	poll, setupE2E, uniqueSlug,
} from './fixtures.js';

describe('Command Templates Settings tab (e2e, real server)', () => {
	const ctx = setupE2E();

	it('lists, edits, persists, reloads, and resets a sparse global override', async () => {
		const project = await createProject(ctx.testServer, {
			projectSlug: uniqueSlug('command-templates'),
		});
		ctx.projects.push(project);
		const overrideFile = path.join(ctx.testServer.dataDir, 'config', 'command-templates.json');
		fs.rmSync(overrideFile, { force: true });

		await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
		await openLauncherSettings(ctx.page);
		expect(await ctx.page.locator(
			'[data-testid="launcher-settings-tab-command-templates"]',
		).count()).toBe(1);
		await openLauncherSettingsTab(ctx.page, 'command-templates');
		expect(await testId(ctx.page, "command-template-list").count()).toBe(1);
		expect(await testId(ctx.page, "command-template-group").count())
			.toBeGreaterThan(0);
		expect(await testId(ctx.page, "command-template-row").count())
			.toBeGreaterThan(0);
		expect(await testId(ctx.page, "command-template-override-state").first().textContent())
			.toBe('Default');

		const gitGroup = ctx.page.locator(
			'[data-command-template-group="Git and repository checks"]',
		);
		const row = ctx.page.locator('[data-command-template-key="git.version"]');
		expect(await testId(row, "command-template-editor-script").isVisible())
			.toBe(false);
		await testId(gitGroup, "command-template-group-toggle").click();
		const scriptField = testId(row, "command-template-editor-script");
		await scriptField.fill('git version');
		const oneLineHeight = (await scriptField.boundingBox())!.height;
		await scriptField.fill('git version\n--build-options\n--no-pager\n--paginate');
		const grownHeight = (await scriptField.boundingBox())!.height;
		expect(grownHeight).toBeGreaterThan(oneLineHeight);
		await testId(row, "command-template-editor-save").click();
		const saved = await poll(
			() => (fs.existsSync(overrideFile)
				? JSON.parse(fs.readFileSync(overrideFile, 'utf8'))
				: null) as Record<string, string> | null,
			(o) => o?.['git.version'] === 'git version\n--build-options\n--no-pager\n--paginate',
			5000,
		);
		expect(saved).toEqual({
			'git.version': 'git version\n--build-options\n--no-pager\n--paginate',
		});
		expect(await poll(
			() => testId(row, "command-template-override-state").textContent(),
			(state) => state === 'Override',
			5000,
			100,
		)).toBe('Override');

		await testId(ctx.page, "launcher-settings-close-button").click();
		await openLauncherSettings(ctx.page);
		await openLauncherSettingsTab(ctx.page, 'command-templates');
		await ctx.page.locator(
			'[data-command-template-group="Git and repository checks"]'
			+ ' [data-testid="command-template-group-toggle"]',
		).click();
		const reloaded = ctx.page.locator('[data-command-template-key="git.version"]');
		expect(await testId(reloaded, "command-template-editor-script").inputValue())
			.toContain('build-options');
		await testId(reloaded, "command-template-reset").click();
		await poll(
			() => testId(reloaded, "command-template-override-state").textContent(),
			(state) => state === 'Default',
			15000,
			100,
		);
		const afterReset = await poll(
			() => (fs.existsSync(overrideFile)
				? JSON.parse(fs.readFileSync(overrideFile, 'utf8'))
				: {}) as Record<string, string>,
			(o) => Object.keys(o).length === 0,
			15000,
		);
		expect(afterReset).toEqual({});
	});
});
