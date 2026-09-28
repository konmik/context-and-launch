import { createProject, uniqueSlug, gotoProject, openTaskDetail, type E2EContext, type CreatedProject } from './fixtures.js'
import { testId, waitVisible } from './locators.js'
import { expect } from 'vitest'

export const APP_LAUNCHER = {
  templates: [
    {
      name: 'Default',
      text: 'do it in {{taskDir}}\n\n{{skills}}',
    },
    {
      name: 'Other',
      text: 'other {{taskDir}}',
    },
  ],
  profiles: [
    {
      name: 'Claude',
      command: 'echo claude',
    },
    {
      name: 'GPT',
      command: 'echo gpt',
    },
  ],
  skills: [
    {
      name: 'alpha-skill',
      text: 'a',
    },
    {
      name: 'bravo-skill',
      text: 'b',
    },
  ],
}

export async function openLauncher(ctx: E2EContext): Promise<void> {
  await openTaskDetail(ctx.page, 't-1-alpha')
  await testId(ctx.page, 'task-detail-tab-launcher').click()
  await waitVisible(ctx.page, 'task-detail-launcher-run-button')
}

export async function setupLauncherTask(ctx: E2EContext, suffix: string): Promise<CreatedProject> {
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug(`tdl-${suffix}`),
    withTasks: [
      {
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
        folderName: 't-1-alpha',
      },
    ],
    appLauncherConfig: APP_LAUNCHER,
  })
  ctx.projects.push(project)
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
  await openLauncher(ctx)
  await expect.poll(() => ctx.page.locator('.cm-content').textContent()).toContain('do it in ')
  return project
}
