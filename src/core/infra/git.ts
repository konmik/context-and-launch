import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'

export async function detectMainBranch(projectPath: string, commands: CommandTemplateExecutor): Promise<string> {
  for (const branch of ['main', 'master']) {
    const list = await commands.execute('git.main-branch.probe', projectPath, {
      branch,
    })
    if (list.trim()) return branch
  }
  throw new Error('Neither main nor master branch exists')
}
