import type { Result } from '~/util/result.js'
import { pickDirectory as pickDirectoryOnServer } from './shared-api.js'

export function pickDirectory(preselect: string): Promise<Result<string | undefined, string>> {
  const desktopPicker = globalThis.window?.contextLaunch?.pickDirectory
  return desktopPicker ? desktopPicker(preselect) : pickDirectoryOnServer(preselect)
}
