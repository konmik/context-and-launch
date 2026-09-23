import { describe, it, expect } from 'vitest';
import { setupE2E, readAppLauncherConfig } from './fixtures.js';
import { openSettingsTab } from './launcher-settings-shared.js';
import { testId, waitGone } from './locators.js';

describe('launcher reference transforms', () => {
  const ctx = setupE2E();

  it.each([
    { tab: 'prompts', prefix: 'prompts', field: 'templateName' },
    { tab: 'launch', prefix: 'launch-profile', field: 'profileName' },
    { tab: 'prompts', prefix: 'skills', field: 'checkedSkills' },
  ] as const)('renames and removes $field references through settings', async ({ tab, prefix, field }) => {
    await openSettingsTab(ctx, {
      slugBase: `references-${prefix}`, tab,
      appLauncherConfig: {
        templates: [{ name: 'old', text: 'text' }], skills: [{ name: 'old', text: 'text' }],
        profiles: [{ name: 'old', command: 'echo test' }],
        columnDefaults: { todo: {
          templateName: 'old', profileName: 'old', checkedSkills: ['old', 'other'],
          skillOrder: ['other', 'old'], editedPrompt: 'keep',
        } },
      },
    });
    await testId(ctx.page, `launcher-settings-${prefix}-edit-button`).click();
    await testId(ctx.page, 'launcher-settings-item-form-name-input').fill('new');
    await testId(ctx.page, 'launcher-settings-item-form-submit').click();
    await waitGone(ctx.page, 'launcher-settings-item-form-submit');
    const renamed = readAppLauncherConfig(ctx.testServer)?.columnDefaults?.todo;
    expect(renamed?.[field]).toEqual(field === 'checkedSkills' ? ['new', 'other'] : 'new');
    if (field === 'checkedSkills') expect(renamed?.skillOrder).toEqual(['other', 'new']);
    await testId(ctx.page, `launcher-settings-${prefix}-delete-button`).click();
    await waitGone(ctx.page, `launcher-settings-${prefix}-delete-button`);
    const removed = readAppLauncherConfig(ctx.testServer)?.columnDefaults?.todo;
    expect(removed).toEqual({
      ...renamed, [field]: field === 'checkedSkills' ? ['other'] : null,
      ...(field === 'checkedSkills' && { skillOrder: ['other'] }),
    });
    expect(removed?.editedPrompt).toBe('keep');
  });
});
