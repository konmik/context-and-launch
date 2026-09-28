import { createProject, uniqueSlug, gotoProject, openTaskDetail, type E2EContext, type CreatedProject } from './fixtures.js'

export async function setupEditorTask(ctx: E2EContext, suffix: string): Promise<CreatedProject> {
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug(`tde-${suffix}`),
    withTasks: [
      {
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
        folderName: 't-1-alpha',
        body: 'original',
      },
    ],
  })
  ctx.projects.push(project)
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
  await openTaskDetail(ctx.page, 't-1-alpha')
  return project
}
