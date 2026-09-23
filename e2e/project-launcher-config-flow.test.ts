import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  setupE2E, seedProject, gotoProject, openLauncherSettings, openLauncherSettingsTab,
  readProjectLauncherConfig,
} from './fixtures.js';
import { testId, waitGone } from './locators.js';

const ctx = setupE2E();

it('shares project overrides and preserves external edits across project switches and reload', async () => {
  const first = await seedProject(ctx, {
    slugBase: 'project-launcher-first',
    appLauncherConfig: { profiles: [{ name: 'Agent', command: 'shared command' }] },
  });
  const second = await seedProject(ctx, { slugBase: 'project-launcher-second' });
  const file = path.join(ctx.testServer.dataDir, 'projects', first.projectSlug, 'config', 'launcher-config.json');
  fs.writeFileSync(file, JSON.stringify({
    ...readProjectLauncherConfig(ctx.testServer, first.projectSlug),
    profiles: [{ name: 'Agent', command: 'project command' }],
  }));
  await gotoProject(ctx.page, ctx.testServer, first.projectSlug);

  async function openLauncher() {
    await testId(ctx.page, 'project-header-title-menu-trigger').click();
    await testId(ctx.page, 'project-header-launch-agent-menuitem').click();
    await testId(ctx.page, 'ticket-detail-launcher-profile-select').waitFor({ state: 'visible' });
  }
  async function closeLauncher() {
    await testId(ctx.page, 'project-launcher-close-button').click();
    await waitGone(ctx.page, 'project-launcher-run-button');
  }
  async function switchProject(slug: string) {
    await testId(ctx.page, 'project-header-project-dropdown-trigger').click();
    await testId(ctx.page, 'project-header-project-item').filter({ hasText: slug }).click();
    await ctx.page.waitForURL(`**/project/${slug}`);
  }

  await openLauncher();
  await closeLauncher();
  await openLauncherSettings(ctx.page);
  await openLauncherSettingsTab(ctx.page, 'launch');
  fs.writeFileSync(file, JSON.stringify({
    ...readProjectLauncherConfig(ctx.testServer, first.projectSlug), branchPrefix: 'external/',
  }));
  const row = testId(ctx.page, 'launcher-settings-launch-profile-row', { 'data-item-name': 'Agent' });
  expect(await row.textContent()).toContain('project command');
  await testId(row, 'launcher-settings-launch-profile-edit-button').click();
  await testId(ctx.page, 'launcher-settings-item-form-name-input').fill('Project Agent');
  await testId(ctx.page, 'launcher-settings-item-form-submit').click();
  await waitGone(ctx.page, 'launcher-settings-item-form-submit');
  expect(readProjectLauncherConfig(ctx.testServer, first.projectSlug)?.branchPrefix).toBe('external/');
  await openLauncherSettingsTab(ctx.page, 'misc');
  expect(await testId(ctx.page, 'launcher-settings-misc-branch-prefix-input').inputValue()).toBe('external/');
  await testId(ctx.page, 'launcher-settings-close-button').click();
  await openLauncher();
  const options = testId(ctx.page, 'ticket-detail-launcher-profile-select').locator('option');
  await expect.poll(() => options.allTextContents()).toEqual(['Agent', 'Project Agent']);
  await closeLauncher();

  await switchProject(second.projectSlug);
  await openLauncher();
  await expect.poll(() => options.allTextContents()).toEqual(['Agent']);
  await closeLauncher();
  await switchProject(first.projectSlug);
  await openLauncher();
  await expect.poll(() => options.allTextContents()).toEqual(['Agent', 'Project Agent']);
  await closeLauncher();
  await ctx.page.reload();
  await openLauncherSettings(ctx.page);
  await openLauncherSettingsTab(ctx.page, 'launch');
  const savedRow = testId(ctx.page, 'launcher-settings-launch-profile-row', { 'data-item-name': 'Project Agent' });
  expect(await savedRow.textContent()).toContain('project command');
  await testId(savedRow, 'launcher-settings-launch-profile-delete-button').click();
  await savedRow.waitFor({ state: 'detached' });
  await testId(ctx.page, 'launcher-settings-close-button').click();
  await openLauncher();
  await expect.poll(() => options.allTextContents()).toEqual(['Agent']);
});
