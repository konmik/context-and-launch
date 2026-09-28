import type { Result } from '~/util/result.js'
import { failure, success } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import fs from 'fs'
import { commandTemplateService, launcherConfigManager, worktreeManager, projectRegistry } from '~/core/config/instances.js'
import { openInOs } from '~/core/infra/open-in-os.js'
import { openDirectoryDialog, openFileDialog } from '~/core/infra/native-file-dialog.js'
import { createNotFoundError, errorPayload } from '~/core/shared/errors.js'

export async function openConfigDir(scope?: string, projectSlug?: string): Promise<Result<void, UserFacingError>> {
  'use server'

  try {
    let dir: string
    if (scope === 'tickets' && projectSlug) dir = worktreeManager.getWorktreeDir(projectSlug)
    else if (scope === 'project' && projectSlug) dir = launcherConfigManager.getProjectDir(projectSlug)
    else if (scope === 'repo' && projectSlug) {
      const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
      if (!project) throw createNotFoundError(`Project not found: ${projectSlug}`)
      dir = project.path
    } else dir = launcherConfigManager.getAppConfigDir()
    if (!fs.existsSync(dir)) throw createNotFoundError(`Directory does not exist: ${dir}`)
    await openInOs(dir, commandTemplateService)
    return success(undefined)
  } catch (error) {
    return failure(errorPayload(error, 'Open folder failed'))
  }
}

export async function openNativeFileBrowser(startDir: string | null): Promise<string[]> {
  'use server'

  return openFileDialog(startDir ?? undefined, commandTemplateService)
}

export async function pickDirectory(preselect: string): Promise<Result<string | undefined, UserFacingError>> {
  'use server'

  try {
    const result = await openDirectoryDialog(preselect, commandTemplateService)
    return result.type === 'Failure' ? failure(errorPayload(result.error, 'Browse failed')) : result
  } catch (error) {
    return failure(errorPayload(error, 'Browse failed'))
  }
}
