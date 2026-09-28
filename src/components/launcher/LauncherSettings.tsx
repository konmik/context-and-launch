import type { JSX } from '@solidjs/web'
import { ErrorScope } from '../shared/ErrorScope.js'
import type { Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { LauncherSettingsContent } from './LauncherSettingsContent.js'

export interface LauncherSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectSlug: string
  onDeleteProject?: (projectSlug: string) => Promise<Result<undefined, UserFacingError>>
}

export default function LauncherSettings(props: LauncherSettingsProps): JSX.Element {
  return (
    <ErrorScope active={props.open}>
      <LauncherSettingsContent {...props} />
    </ErrorScope>
  )
}
