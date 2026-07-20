import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createProject, gotoProject, openLauncherSettings, openLauncherSettingsTab,
	setupE2E, uniqueSlug,
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
		expect(await ctx.page.locator('[data-testid="command-template-list"]').count()).toBe(1);
		expect(await ctx.page.locator('[data-testid="command-template-group"]').count())
			.toBeGreaterThan(0);
		expect(await ctx.page.locator('[data-testid="command-template-row"]').count())
			.toBeGreaterThan(0);
		expect(await ctx.page.locator('[data-testid="command-template-override-state"]').first().textContent())
			.toBe('Default');

		const gitGroup = ctx.page.locator(
			'[data-command-template-group="Git and repository checks"]',
		);
		const row = ctx.page.locator('[data-command-template-key="git.version"]');
		expect(await row.locator('[data-testid="command-template-editor-script"]').isVisible())
			.toBe(false);
		await gitGroup.locator('[data-testid="command-template-group-toggle"]').click();
		const scriptField = row.locator('[data-testid="command-template-editor-script"]');
		await scriptField.fill('git version');
		const oneLineHeight = (await scriptField.boundingBox())!.height;
		await scriptField.fill('git version\n--build-options\n--no-pager\n--paginate');
		const grownHeight = (await scriptField.boundingBox())!.height;
		expect(grownHeight).toBeGreaterThan(oneLineHeight);
		await row.locator('[data-testid="command-template-editor-save"]').click();
		await ctx.page.waitForTimeout(500);
		expect(JSON.parse(fs.readFileSync(overrideFile, 'utf8'))).toEqual({
			'git.version': 'git version\n--build-options\n--no-pager\n--paginate',
		});
		expect(await row.locator('[data-testid="command-template-override-state"]').textContent())
			.toBe('Override');

		await ctx.page.click('[data-testid="launcher-settings-close-button"]');
		await openLauncherSettings(ctx.page);
		await openLauncherSettingsTab(ctx.page, 'command-templates');
		await ctx.page.locator(
			'[data-command-template-group="Git and repository checks"]'
			+ ' [data-testid="command-template-group-toggle"]',
		).click();
		const reloaded = ctx.page.locator('[data-command-template-key="git.version"]');
		expect(await reloaded.locator('[data-testid="command-template-editor-script"]').inputValue())
			.toContain('build-options');
		await reloaded.locator('[data-testid="command-template-reset"]').click();
		await ctx.page.waitForTimeout(500);
		expect(JSON.parse(fs.readFileSync(overrideFile, 'utf8'))).toEqual({});
	}, 60_000);
});
